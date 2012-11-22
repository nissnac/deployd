var fs = require('fs')
  , path = require('path')
  , domain = require('domain')
  , debug = require('debug')('module-loader')
  , Resource = require('./resource')
  , Module = require('./module')
  , q = require('q')
  , async = require('async');

var cache;

module.exports = function loadModules(basepath, fn) {
  if (cache) fn(null, cache);

  if(typeof basepath == 'function') {
    fn = basepath; 
    basepath = undefined;
  }

  basepath = basepath || '.';

  var getDirQ = function(dirpath) {
    return q.ninvoke(fs, 'readdir', dirpath).then(function(dir) {
      return dir.map(function(f) {
        return path.join(dirpath, f);
      });
    });
  };

  var modulesDirQ = getDirQ(path.join(basepath, 'node_modules')).fail(function(err) {
    if (err.code === "ENOENT") {
      return [];
    } else {
      throw err;
    }
  });

  var allFilesQ = q.spread([
      getDirQ(path.join(__dirname, 'modules')), 
      modulesDirQ
    ], function(defaultResources, modules) {
      return defaultResources.concat(modules);
    });

  var modulesQ = allFilesQ.then(function(allFiles) {
    var modules = {};

    return q.ninvoke(async, 'forEach', allFiles, function(file, fn) {
      loadModule(file, function(err, module) {
        if (err) return fn(err);
        if (module) modules[module.id] = module;
        fn();
      });
    }).then(function() {

      return modules;
    });
  });

  modulesQ.then(function(modules) {
    cache = modules;
    fn(null, modules);
  }, function(error) {
    fn(error);
  });

};

module.exports.clearCache = function(){
  cache = null;
};

function loadModule(file, fn) {
  var statQ = q.ninvoke(fs, 'stat', file);
  var moduleQ = statQ.then(function(stat) {
    if (stat.isDirectory() || path.extname(file) === '.js') {
      var module;
      try {
        module = require(path.resolve(file));  
      } catch (ex) {
        // TODO: test this; we don't want it to print the error twice (further down the callstack)
        console.error("An error occurred while loading " + file + ": ");
        console.error(ex);
        throw ex;
      }
      module = module || {};
      if (!module.id) module.id = (typeof module === 'function' && module.name) || path.basename(file, '.js');
      return module;
    } else {
      return null;
    }
  });

  moduleQ.then(function(module) {
    fn(null, module);
  }, function(error) {
    fn(error);
  });
}