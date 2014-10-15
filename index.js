'use strict';
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var WebSocket = require('ws');
var _ = require('lodash');

var MESSAGE_SCHEMA = {
  type: 'object',
  properties: {
    command: {
      type: 'object',
      required: true
    }
  }
};

var OPTIONS_SCHEMA = {
  type: 'object',
  properties: {
    ipAddress: {
      type: 'string',
      required: true,
      default: '127.0.0.1'
    },
    orientationBroadcastInterval: {
      type: 'string',
      required: true,
      default: 500
    }
  }
};

function Plugin(){
  this.setOptions({ipAddress: '127.0.0.1', orientationBroadcastInterval: 500});
  this.messageSchema = MESSAGE_SCHEMA;
  this.optionsSchema = OPTIONS_SCHEMA;
  return this;
}
util.inherits(Plugin, EventEmitter);

Plugin.prototype.onMessage = function(message){
  var payload = message.payload;
};

Plugin.prototype.setOptions = function(options){
  this.options = options;

  this.setupMyo();
};


Plugin.prototype.setupMyo = function() {
  var self = this;

  if (!self.options.ipAddress){
    return;
  }

  var throttledEmit = _.throttle(self.emit, self.options.orientationBroadcastInterval);
  
  self._myo = new WebSocket('ws://' + self.options.ipAddress + ':10138/myo/1');
  self._myo.on('message', function(message) {
    var emitFunction, data;
    data         = _.last(JSON.parse(message));

    if (data.type === 'orientation') {
      throttledEmit('data', data);
      return;
    }
    self.emit('data', data);
  }); 
}

module.exports = {
  messageSchema: MESSAGE_SCHEMA,
  optionsSchema: OPTIONS_SCHEMA,
  Plugin: Plugin
};
