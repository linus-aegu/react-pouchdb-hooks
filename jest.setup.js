// Polyfill for setImmediate used by PouchDB memory adapter
global.setImmediate =
  global.setImmediate || ((fn, ...args) => global.setTimeout(fn, 0, ...args))

// Configure React DOM for testing with React 19
global.IS_REACT_ACT_ENVIRONMENT = true
