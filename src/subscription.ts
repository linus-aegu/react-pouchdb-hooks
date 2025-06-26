import { clone } from 'pouchdb-utils'

export type DocsCallback<T extends {}> = (
  deleted: boolean,
  id: PouchDB.Core.DocumentId,
  doc?: PouchDB.Core.Document<T>
) => void

interface DocsSubscription {
  changesFeed: PouchDB.Core.Changes<Record<string, unknown>>
  all: Set<DocsCallback<Record<string, unknown>>>
  ids: Map<PouchDB.Core.DocumentId, Set<DocsCallback<Record<string, unknown>>>>
  batchTimeout: NodeJS.Timeout | null
  pendingChanges: Map<PouchDB.Core.DocumentId, PendingChange>
}

interface PendingChange {
  deleted: boolean
  id: PouchDB.Core.DocumentId
  doc?: PouchDB.Core.Document<Record<string, unknown>>
  timestamp: number
}

export type ViewCallback = (id: PouchDB.Core.DocumentId) => void
export type subscribeToView = (
  fun: string,
  callback: ViewCallback
) => () => void

interface SubscriptionToAView {
  feed: PouchDB.Core.Changes<{}>
  callbacks: Set<ViewCallback>
}
export type subscribeToDocs = <T extends {}>(
  ids: PouchDB.Core.DocumentId[] | null,
  callback: DocsCallback<T>
) => () => void

export default class SubscriptionManager {
  #pouch: PouchDB.Database
  #destroyListener: () => void

  #docsSubscription: DocsSubscription | null = null
  #viewsSubscription = new Map<string, SubscriptionToAView>()

  #didUnsubscribeAll = false
  #batchingEnabled = true
  #batchDelay = 16

  constructor(
    pouch: PouchDB.Database,
    options?: { enableBatching?: boolean; batchDelay?: number }
  ) {
    this.#pouch = pouch
    this.#batchingEnabled = options?.enableBatching ?? true
    this.#batchDelay = options?.batchDelay ?? 16
    this.#destroyListener = () => {
      this.unsubscribeAll()
    }
    pouch.once('destroyed', this.#destroyListener)
  }

  subscribeToDocs<T extends {}>(
    ids: PouchDB.Core.DocumentId[] | null,
    callback: DocsCallback<T>
  ): () => void {
    if (this.#didUnsubscribeAll) {
      return () => {
        return
      }
    }

    if (this.#docsSubscription == null) {
      this.#docsSubscription = createDocSubscription(
        this.#pouch,
        this.#batchingEnabled,
        this.#batchDelay
      )
    }

    const isIds = Array.isArray(ids) && ids.length > 0

    if (isIds) {
      for (const id of ids ?? []) {
        if (this.#docsSubscription.ids.has(id)) {
          this.#docsSubscription.ids.get(id)?.add(callback as DocsCallback<{}>)
        } else {
          const set: Set<DocsCallback<{}>> = new Set()
          set.add(callback as DocsCallback<{}>)
          this.#docsSubscription.ids.set(id, set)
        }
      }
    } else {
      this.#docsSubscription.all.add(callback as DocsCallback<{}>)
    }

    let didUnsubscribe = false
    return () => {
      if (didUnsubscribe || this.#didUnsubscribeAll) return
      didUnsubscribe = true

      if (isIds) {
        for (const id of ids ?? []) {
          const set = this.#docsSubscription?.ids.get(id)
          set?.delete(callback as DocsCallback<{}>)

          if (set?.size === 0) {
            this.#docsSubscription?.ids.delete(id)
          }
        }
      } else {
        this.#docsSubscription?.all.delete(callback as DocsCallback<{}>)
      }

      if (
        this.#docsSubscription?.all.size === 0 &&
        this.#docsSubscription.ids.size === 0
      ) {
        this.#docsSubscription.changesFeed.cancel()
        this.#docsSubscription = null
      }
    }
  }

  subscribeToView(fun: string, callback: ViewCallback): () => void {
    if (this.#didUnsubscribeAll) {
      return () => {
        return
      }
    }

    let subscription: SubscriptionToAView

    if (this.#viewsSubscription.has(fun)) {
      subscription = this.#viewsSubscription.get(fun) as SubscriptionToAView
    } else {
      subscription = subscribeToView(this.#pouch, fun)
      this.#viewsSubscription.set(fun, subscription)
    }

    subscription.callbacks.add(callback)

    let didUnsubscribe = false
    return () => {
      if (didUnsubscribe || this.#didUnsubscribeAll) return
      didUnsubscribe = true

      subscription.callbacks.delete(callback)

      if (subscription.callbacks.size === 0) {
        subscription.feed.cancel()
        this.#viewsSubscription.delete(fun)
      }
    }
  }

  unsubscribeAll(): void {
    if (this.#didUnsubscribeAll) return
    this.#didUnsubscribeAll = true

    this.#pouch.removeListener('destroyed', this.#destroyListener)

    if (this.#docsSubscription) {
      if (this.#docsSubscription.batchTimeout) {
        clearTimeout(this.#docsSubscription.batchTimeout)
        this.#docsSubscription.batchTimeout = null
      }

      this.#docsSubscription.changesFeed.cancel()
      this.#docsSubscription.all.clear()
      this.#docsSubscription.ids.forEach(set => {
        set.clear()
      })
      this.#docsSubscription.ids.clear()
      this.#docsSubscription.pendingChanges.clear()
    }

    for (const viewInfo of this.#viewsSubscription.values()) {
      viewInfo.feed.cancel()
      viewInfo.callbacks.clear()
    }
    this.#viewsSubscription.clear()
  }
}

function createDocSubscription(
  pouch: PouchDB.Database,
  batchingEnabled: boolean,
  batchDelay: number
): DocsSubscription {
  let docsSubscription: DocsSubscription | null = null

  const changesFeed = pouch
    .changes({
      since: 'now',
      live: true,
      include_docs: true,
    })
    .on('change', change => {
      if (!docsSubscription) return

      const doc = change.deleted
        ? undefined
        : (change.doc as PouchDB.Core.Document<{}>)

      if (batchingEnabled) {
        const pendingChange: PendingChange = {
          deleted: change.deleted || false,
          id: change.id,
          doc: doc as PouchDB.Core.Document<Record<string, unknown>>,
          timestamp: Date.now(),
        }

        docsSubscription.pendingChanges.set(change.id, pendingChange)

        if (docsSubscription.batchTimeout) return

        docsSubscription.batchTimeout = setTimeout(() => {
          if (docsSubscription) {
            const changesToProcess = Array.from(
              docsSubscription.pendingChanges.values()
            )
            docsSubscription.pendingChanges.clear()
            docsSubscription.batchTimeout = null

            for (const pendingChange of changesToProcess) {
              const hasAll = docsSubscription.all.size > 0
              const idSubscriptions = docsSubscription.ids.get(pendingChange.id)

              if (hasAll) {
                notify(
                  docsSubscription.all,
                  pendingChange.deleted,
                  pendingChange.id,
                  pendingChange.doc
                )
              }
              if (idSubscriptions) {
                notify(
                  idSubscriptions,
                  pendingChange.deleted,
                  pendingChange.id,
                  pendingChange.doc
                )
              }
            }
          }
        }, batchDelay) as NodeJS.Timeout
      } else {
        const hasAll = docsSubscription.all.size > 0
        const idSubscriptions = docsSubscription.ids.get(change.id)

        if (hasAll) {
          notify(
            docsSubscription.all,
            change.deleted || false,
            change.id,
            doc as PouchDB.Core.Document<Record<string, unknown>>
          )
        }
        if (idSubscriptions) {
          notify(
            idSubscriptions,
            change.deleted || false,
            change.id,
            doc as PouchDB.Core.Document<Record<string, unknown>>
          )
        }
      }
    })

  docsSubscription = {
    changesFeed,
    all: new Set(),
    ids: new Map(),
    batchTimeout: null,
    pendingChanges: new Map(),
  }

  return docsSubscription
}

function notify(
  set: Set<DocsCallback<Record<string, unknown>>>,
  deleted: boolean,
  id: PouchDB.Core.DocumentId,
  doc?: PouchDB.Core.Document<Record<string, unknown>>
) {
  for (const subscription of set) {
    try {
      const document = doc ? clone(doc) : undefined
      subscription(deleted, id, document)
    } catch (err) {
      console.error(err)
    }
  }
}

function subscribeToView(
  pouch: PouchDB.Database,
  view: string
): SubscriptionToAView {
  let viewsSubscription: SubscriptionToAView | null = null

  const changesFeed = pouch
    .changes({
      since: 'now',
      live: true,
      filter: '_view',
      view,
    })
    .on('change', change => {
      for (const callback of viewsSubscription?.callbacks ?? []) {
        try {
          callback(change.id)
        } catch (err) {
          console.error(err)
        }
      }
    })

  viewsSubscription = {
    feed: changesFeed,
    callbacks: new Set(),
  }

  return viewsSubscription
}
