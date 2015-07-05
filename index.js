'use strict';
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var _ = require('lodash');
var Myo = require('myo');
var debug = require('debug')('meshblu-myo:index');

var DEFAULT_OPTIONS = {
  id : 0,
  interval: 500,
  accelerometer: {
    enabled : false
  },
  imu: {
    enabled : false
  },
  gyroscope: {
    enabled : false
  },
  orientation: {
    enabled: false
  }
};

var MESSAGE_SCHEMA = {
  type: 'object',
  properties: {
   command : {
     type : 'object',
     properties : {
       action : {
         type : 'string',
         enum : ['vibrate', 'requestBlueToothStrength', 'zeroOrientation'],
         default : 'vibrate'
       },
       vibrationLength : {
         type : 'string',
         enum : ['short', 'medium', 'long'],
         default : 'short'
       }
     }
   }
  }
};

var OPTIONS_SCHEMA = {
  type: 'object',
  properties: {
    id : {
      type : 'number',
      default : 0,
      required : true
    },
    interval: {
      title : 'interval in ms',
      type: 'number',
      required : true,
      default: 500
    },
    accelerometer: {
      type: 'object',
      properties: {
        enabled: {
          type: 'boolean',
          required: true,
          default: false
        }
      }
    },
    imu : {
      type : 'object',
      properties : {
        enabled : {
          type : 'boolean',
          required : true,
          default : false
        }
      }
    },
    gyroscope : {
      type: 'object',
      properties: {
        enabled: {
          type: 'boolean',
          required: true,
          default: false
        }
      }
    },
    orientation : {
      type: 'object',
      properties: {
        enabled: {
          type: 'boolean',
          required: true,
          default: false
        }
      }
    }
  }
};

function Plugin(){
  this.setOptions(DEFAULT_OPTIONS);
  this.messageSchema = MESSAGE_SCHEMA;
  this.optionsSchema = OPTIONS_SCHEMA;
  this.defaultOptions = DEFAULT_OPTIONS;
  return this;
}
util.inherits(Plugin, EventEmitter);

Plugin.prototype.onMessage = function(message){
  if(Myo.myos && this._myo){
    if (message.payload.command && message.payload.command.action) {
      var action = message.payload.command.action;
      if(action === 'vibrate'){
        this._myo.vibrate(message.payload.command.vibrationLength);
      } else if(action === 'requestBluetoothStrength'){
        this._myo.requestBluetoothStrength();
      } else if(action === 'zeroOrientation'){
        this._myo.zeroOrientation();
      }
    }
  }
};

Plugin.prototype.onConfig = function(device){
  var self = this;
  self.setOptions(device.options||DEFAULT_OPTIONS);
};

Plugin.prototype.setOptions = function(options){
  this.options = _.extend({}, DEFAULT_OPTIONS, options);
  this.setupMyo();
};

Plugin.prototype.setupMyo = function() {
  var self = this;

  var myoId = self.options.id || 0;
  var myoOptions =  {
      api_version : 3,
      socket_url  : "ws://127.0.0.1:10138/myo/"
  };
  self._myo = Myo.create(myoId, myoOptions);

  var throttledEmit = _.throttle(function(){
    debug('throttled', arguments);
    self.emit.apply(self, arguments);
  }, self.options.interval);

  self._myo.on('connected', function(){
    debug('We are connected to Myo, ', this.id);
    self._myo.unlock();
    self._myo.vibrate('long');
    throttledEmit('message', {
      devices: ['*'],
      payload: {
        event : 'connected'
      }
    });
  })

  self._myo.on('disconnected', function(){
    debug('We are disconnected from Myo');
    throttledEmit('message', {
      devices: ['*'],
      payload: {
        event : 'disconnected'
      }
    });
  })

  self._myo.on('arm_synced', function(){
    debug('Arm Synced');
    throttledEmit('message', {
      devices: ['*'],
      payload: {
        event : 'arm_synced'
      }
    });
  });

  self._myo.on('arm_unsynced', function(){
    debug('Arm arm_unsynced');
    throttledEmit('message', {
      devices: ['*'],
      payload: {
        event : 'arm_unsynced'
      }
    });
  });

  self._myo.on('lock', function(data){
    debug('Locked Myo');
    self._myo.vibrate('short');
    throttledEmit('message', {
      devices: ['*'],
      payload: data
    });
  });

  self._myo.on('unlock', function(data){
    debug('Unlocked Myo');
    // self._myo.vibrate('short').vibrate('short');
    throttledEmit('message', {
      devices: ['*'],
      payload: data
    });
  });

  if(self.options.accelerometer.enabled){
    self._myo.on('accelerometer', function(data){
      throttledEmit('message', {
        devices: ['*'],
        payload: {
          accelerometer: data
        }
      });
    });
  }

  if(self.options.gyroscope.enabled){
    self._myo.on('gyroscope', function(data){
      throttledEmit('message', {
        devices: ['*'],
        payload: {
          gyroscope: data
        }
      });
    });
  }

  if(self.options.orientation.enabled){
    self._myo.on('orientation', function(data){
      var offset = self._myo.orientationOffset;
      data.w += offset.w;
      data.x += offset.x;
      data.y += offset.y;
      data.z += offset.z;
      throttledEmit('message', {
        devices: ['*'],
        payload: {
          orientation: data
        }
      });
    });
  }

  if(self.options.imu.enabled){
    self._myo.on('imu', function(data){
      throttledEmit('message', {
        devices: ['*'],
        payload: {
          imu: data
        }
      });
    });
  }

  self._myo.on('pose', function(poseName, edge){
    self._myo.unlock(5000);
    if(!edge){
      return;
    }
    debug('Pose', poseName, edge);
    throttledEmit('message', {
      devices: ['*'],
      payload: {
        pose : poseName,
        edge : edge
      }
    });
  });

  self._myo.on('bluetooth_strength', function(val){
    throttledEmit('message', {
      devices: ['*'],
      payload: {
        bluetoothStrength : val
      }
    });
  });

};

module.exports = {
  messageSchema: MESSAGE_SCHEMA,
  optionsSchema: OPTIONS_SCHEMA,
  defaultOptions : DEFAULT_OPTIONS,
  Plugin: Plugin
};
