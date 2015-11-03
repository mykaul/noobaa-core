'use strict';

var _ = require('lodash');
var util = require('util');
var events = require('events');
var P = require('../util/promise');
var time_utils = require('../util/time_utils');
var dbg = require('../util/debug_module')(__filename);

module.exports = RpcBaseConnection;

util.inherits(RpcBaseConnection, events.EventEmitter);

var STATE_INIT = 'init';
var STATE_CONNECTING = 'connecting';
var STATE_CONNECTED = 'connected';
var STATE_CLOSED = 'closed';

function RpcBaseConnection(addr_url) {
    var self = this;
    events.EventEmitter.call(self);

    // the remote address of the connection
    self.url = addr_url;

    // connid is for debugging purposes
    // TODO commnicate connid to the other side to match in logs
    self.connid = addr_url.href + '(' + time_utils.nanostamp().toString(36) + ')';

    // the connection generates request sequences, see _alloc_reqid()
    self._rpc_req_seq = 1;

    // state machine
    self._state = STATE_INIT;

    // the connecting_defer is used by connect() to wait for the connected event
    self.connecting_defer = P.defer();
    self.connecting_defer.promise.fail(_.noop); // to prevent error log of unhandled rejection

    // the 'connect' event is emitted by the inherited type (http/ws/tcp/n2n)
    // and is expected after calling _connect() or when a connection is accepted
    // and already considered connected.
    self.once('connect', function on_connect() {
        if (!self.transient) {
            dbg.log0('RPC CONN CONNECTED state', self._state, self.connid);
        }
        if (self._state === STATE_CONNECTING || self._state === STATE_INIT) {
            self._state = STATE_CONNECTED;
            clearTimeout(self._connect_timeout);
        }
        if (self.connecting_defer) {
            self.connecting_defer.resolve();
            self.connecting_defer = null;
        }
    });

    // connections are closed on error, and once closed will not be reopened again.
    self.on('error', function on_error(err) {
        dbg.error('RPC CONN CLOSE ON ERROR', self.connid, err.stack || err);
        self.close();
    });

    // on send failures we handle by closing and rethrowing to the caller
    self.emit_error = function emit_error(err) {
        self.emit('error', err);
    };
}

/**
 *
 * connect
 *
 * it is not essential to call connect() since send() will do that if needed
 * but this can be useful when calling explicitly for separating timeouts
 * or reconnecting.
 */
RpcBaseConnection.prototype.connect = function() {
    switch (this._state) {
        case STATE_INIT:
            // start connecting and wait for the 'connect' event
            this._state = STATE_CONNECTING;
            // set a timer to limit how long we are waiting for connect
            this._connect_timeout = setTimeout(this.emit_error, 5000, 'RPC CONN TIMEOUT');
            this._connect();
            return this.connecting_defer.promise;
        case STATE_CONNECTING:
            return this.connecting_defer.promise;
        case STATE_CONNECTED:
            return;
        case STATE_CLOSED:
            throw new Error('RPC CONN CLOSED ' + this.connid);
        default:
            throw new Error('RPC CONN ON WEIRD STATE ' + this._state + ' ' + this.connid);
    }
};

/**
 *
 * send message
 *
 */
RpcBaseConnection.prototype.send = function(msg, op, req) {
    if (this._state !== STATE_CONNECTED) {
        throw new Error('RPC CONN NOT CONNECTED ' + this._state + ' ' + this.connid);
    }
    return P.invoke(this, '_send', msg, op, req).fail(this.emit_error);
    // return this._send(msg, op, req);
};

RpcBaseConnection.prototype.close = function() {
    if (this._state === STATE_CLOSED) return;
    this._state = STATE_CLOSED;
    this.emit('close');
    clearTimeout(this._connect_timeout);
    if (this.connecting_defer) {
        this.connecting_defer.reject('RPC CONN CLOSED ' + this.connid);
        this.connecting_defer = null;
    }
    this._close();
};

RpcBaseConnection.prototype.is_closed = function() {
    return this._state === STATE_CLOSED;
};

RpcBaseConnection.prototype._alloc_reqid = function() {
    var reqid = this._rpc_req_seq + '@' + this.connid;
    this._rpc_req_seq += 1;
    return reqid;
};
