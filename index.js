'use strict';
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var _ = require('lodash');
var Myo = require('myo');
var debug = require('debug')('meshblu-myo:index');

var isMyoConnected = false;

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
  if(Myo.myos){
    if (message.payload.command && message.payload.command.action) {
      var action = message.payload.command.action;
      if(action === 'vibrate'){
        Myo.vibrate(message.payload.command.vibrationLength);
      } else if(action === 'requestBluetoothStrength'){
        Myo.requestBluetoothStrength();
      } else if(action === 'zeroOrientation'){
        Myo.zeroOrientation();
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
  Myo.defaults =  {
    api_version : 3,
    socket_url  : "ws://127.0.0.1:10138/myo/",
    app_id      : 'com.octoblu.myo'
  };

  debug('creating myo with', myoId, Myo.defaults);

    Myo.connect(Myo.defaults.app_id);

  if(!isMyoConnected){
    isMyoConnected = true;
    self.myoEvents();
  }
};

Plugin.prototype.myoEvents = function(){

  var self = this;

  var throttledEmit = _.throttle(function(payload){
    debug('throttled', payload);
    self.emit('message', {"devices": ['*'], "payload": payload});
   }, self.options.interval, {'leading': false});


  Myo.on('connected', function(data){
    self._myo = data;
    debug('We are connected to Myo, ', data);
    this.unlock();
    throttledEmit({ "event": 'connected' });
  })

  Myo.on('disconnected', function(){
    debug('We are disconnected from Myo');
    throttledEmit({ "event": 'disconnected' });
  })

  Myo.on('arm_synced', function(){
    debug('Arm Synced');
    throttledEmit({ "event": 'arm_synced' });
  });

  Myo.on('arm_unsynced', function(){
    debug('Arm arm_unsynced');
    throttledEmit({ "event": 'arm_unsynced' });
  });

  Myo.on('locked', function(data){
    debug('Locked Myo');
    throttledEmit({"event": 'locked'});
  });

  Myo.on('unlocked', function(data){
    debug('Unlocked Myo');
    throttledEmit({"event": 'unlocked'});
  });


    Myo.on('accelerometer', function(data){
      if(self.options.accelerometer.enabled){
      throttledEmit({ "accelerometer": data });
      }
    });



    Myo.on('gyroscope', function(data){
      if(self.options.gyroscope.enabled){
      throttledEmit({ "gyroscope": data });
     }
    });

    Myo.on('orientation', function(data){
      data = {
        offset: {
          w: data.w,
          x: data.x,
          y: data.y,
          z: data.z
        }
      };

      if(self.options.orientation.enabled){
      throttledEmit({ "orientation": data });
     }
    });

    Myo.on('imu', function(data){
      if(self.options.imu.enabled){
      throttledEmit({ "imu": data });
     }
    });

  Myo.on('pose_off', function(poseNameOff){
    this.unlock();

    var poseName = poseNameOff.replace("_off", "");
    debug('event', poseName);
    throttledEmit({ "event": poseName});
  });

  Myo.on('rssi', function(val){
    throttledEmit({ "bluetoothStrength": val });
  });

  Myo.on('battery_level', function(val){
    throttledEmit({ "batteryLevel": val });

};


module.exports = {
  messageSchema: MESSAGE_SCHEMA,
  optionsSchema: OPTIONS_SCHEMA,
  defaultOptions : DEFAULT_OPTIONS,
  Plugin: Plugin
};
