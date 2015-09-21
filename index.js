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
  debug('starting');
  var self = this;
  self.setOptions(DEFAULT_OPTIONS);
  self.messageSchema = MESSAGE_SCHEMA;
  self.optionsSchema = OPTIONS_SCHEMA;
  self.defaultOptions = DEFAULT_OPTIONS;
  return self;
}
util.inherits(Plugin, EventEmitter);

Plugin.prototype.onMessage = function(message){
  debug('got message', message);
  var self = this;
  if(Myo.myos && self._myo){
    if (message.payload.command && message.payload.command.action) {
      var action = message.payload.command.action;
      if(action === 'vibrate'){
        self._myo.vibrate(message.payload.command.vibrationLength);
      } else if(action === 'requestBluetoothStrength'){
        self._myo.requestBluetoothStrength();
      } else if(action === 'zeroOrientation'){
        self._myo.zeroOrientation();
      }
    }
  }
};

Plugin.prototype.onConfig = function(device){
  var self = this;
  self.setOptions(device.options||DEFAULT_OPTIONS);
};

Plugin.prototype.setOptions = function(options){
  var self = this;
  self.options = _.extend({}, DEFAULT_OPTIONS, options);
  self.setupMyo();
};

Plugin.prototype.setupMyo = function() {
  debug('setting up myo');
  var self = this;

  var myoId = self.options.id || 0;
  var myoOptions =  {
    api_version : 3,
    socket_url  : "ws://127.0.0.1:10138/myo/",
    app_id      : 'com.octoblu.myo'
  };

  debug('creating myo with', myoId, myoOptions);
  self._myo = Myo.create(myoId, myoOptions);

  var throttledEmit = _.throttle(function(payload){
    debug('throttled', payload);
    self.emit('message', {devices: ['*'], payload: payload});
  }, self.options.interval);

  self._myo.on('connected', function(){
    debug('We are connected to Myo, ', self.id);
    self._myo.unlock();
    self._myo.vibrate('long');
    throttledEmit({ event: 'connected' });
  })

  self._myo.on('disconnected', function(){
    debug('We are disconnected from Myo');
    throttledEmit({ event: 'disconnected' });
  })

  self._myo.on('arm_synced', function(){
    debug('Arm Synced');
    throttledEmit({ event: 'arm_synced' });
  });

  self._myo.on('arm_unsynced', function(){
    debug('Arm arm_unsynced');
    throttledEmit({ event: 'arm_unsynced' });
  });

  self._myo.on('locked', function(data){
    debug('Locked Myo');
    self._myo.vibrate('short');
    throttledEmit(data);
  });

  self._myo.on('unlocked', function(data){
    debug('Unlocked Myo');
    // self._myo.vibrate('short').vibrate('short');
    throttledEmit(data);
  });

  if(self.options.accelerometer.enabled){
    self._myo.on('accelerometer', function(data){
      throttledEmit({ accelerometer: data });
    });
  }

  if(self.options.gyroscope.enabled){
    self._myo.on('gyroscope', function(data){
      throttledEmit({ gyroscope: data });
    });
  }

  if(self.options.orientation.enabled){
    self._myo.on('orientation', function(data){
      var offset = self._myo.orientationOffset;
      data.w += offset.w;
      data.x += offset.x;
      data.y += offset.y;
      data.z += offset.z;
      throttledEmit({ orientation: data });
    });
  }

  if(self.options.imu.enabled){
    self._myo.on('imu', function(data){
      throttledEmit({ imu: data });
    });
  }

  self._myo.on('pose', function(poseName, edge){
    self._myo.unlock(5000);
    if(!edge){
      return;
    }
    debug('Pose', poseName, edge);
    throttledEmit({ pose: poseName, edge: edge });
  });

  self._myo.on('rssi', function(val){
    throttledEmit({ bluetoothStrength: val });
  });

  self._myo.on('battery_level', function(val){
    throttledEmit({ batteryLevel: val });
  });

};

module.exports = {
  messageSchema: MESSAGE_SCHEMA,
  optionsSchema: OPTIONS_SCHEMA,
  defaultOptions : DEFAULT_OPTIONS,
  Plugin: Plugin
};
