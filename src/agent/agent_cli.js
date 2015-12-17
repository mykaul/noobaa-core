/* jshint node:true */
'use strict';
require('../util/panic');

var _ = require('lodash');
var P = require('../util/promise');
var fs = require('fs');
var os = require('os');
var path = require('path');
var util = require('util');
var repl = require('repl');
var mkdirp = require('mkdirp');
var argv = require('minimist')(process.argv);
var Semaphore = require('../util/semaphore');
var api = require('../api');
var Agent = require('./agent');
var fs_utils = require('../util/fs_utils');
var promise_utils = require('../util/promise_utils');
// var config = require('../../config.js');
var dbg = require('../util/debug_module')(__filename);
var child_process = require('child_process');
var s3_auth = require('aws-sdk/lib/signers/s3');
var uuid = require('node-uuid');
var os = require('os');
var os_util = require('../util/os_util');



setInterval(function() {
    dbg.log0('memory usage', process.memoryUsage());
}, 30000);

dbg.set_process_name('Agent');
/**
 *
 * AgentCLI
 *
 * runs multiple agents in same process and provides CLI to list/start/stop/create etc.
 *
 * but might also be relevant for other environments that want to combine multiple agents.
 * when running local testing where it's easier to run all the agents inside the same process.
 *
 */
function AgentCLI(params) {
    this.params = params;
    this.client = new api.Client();
    this.s3 = new s3_auth();
    this.agents = {};
}


/**
 *
 * INIT
 *
 *
 *
 */
AgentCLI.prototype.init = function() {
    var self = this;

    return P.nfcall(fs.readFile, 'agent_conf.json')
        .then(function(data) {
            var agent_conf = JSON.parse(data);
            dbg.log0('using agent_conf.json', util.inspect(agent_conf));
            _.defaults(self.params, agent_conf);
        })
        .then(null, function(err) {
            dbg.log0('cannot find configuration file. Using defaults.', err);
        })
        .then(function() {
            _.defaults(self.params, {
                root_path: './agent_storage/',
                access_key: '123',
                secret_key: 'abc',
                system: 'demo',
                tier: 'nodes',
                bucket: 'files'
            });
            if (self.params.address) {
                self.client.options.address = self.params.address;
            }

            if (self.params.setup) {
                dbg.log0('Setup');
                var account_params = _.pick(self.params, 'email', 'password');
                account_params.name = account_params.email;
                return self.client.account.create_account(account_params)
                    .then(function() {
                        dbg.log0('COMPLETED: setup', self.params);
                    }, function(err) {
                        dbg.log0('ERROR: setup', self.params, err.stack);
                    })
                    .then(function() {
                        process.exit();
                    });
            }
        }).then(function() {
            return os_util.read_drives();
        })
        .then(function(drives) {
            dbg.log0('drives:', drives, ' current location ', process.cwd());
            var hds = _.filter(drives, function(hd_info) {
                if ((hd_info.drive_id.indexOf('/dev/') >= 0 && hd_info.mount.indexOf('/boot') < 0 && hd_info.mount.indexOf('/Volumes/') < 0) ||
                    (hd_info.drive_id.length === 2 && hd_info.drive_id.indexOf(':') === 1)) {
                    dbg.log0('Found relevant volume', hd_info.drive_id);
                    return true;
                }
            });
            var server_uuid = os.hostname() + '-' + uuid();
            console.log('Server:' + server_uuid + ' with HD:' + JSON.stringify(hds));

            var mount_points = [];

            if (os.type() === 'Windows_NT') {
                _.each(hds, function(hd_info) {
                    if (process.cwd().toLowerCase().indexOf(hd_info.drive_id.toLowerCase()) === 0) {
                        hd_info.mount = './agent_storage/';
                        mount_points.push(hd_info);
                    } else {
                        hd_info.mount = hd_info.mount + '\\agent_storage\\';
                        mount_points.push(hd_info);
                    }
                });
            } else {
                _.each(hds, function(hd_info) {
                    if (hd_info.mount === "/") {
                        hd_info.mount = './agent_storage/';
                        mount_points.push(hd_info);
                    } else {
                        hd_info.mount = '/' + hd_info.mount + '/agent_storage/';
                        mount_points.push(hd_info);
                    }
                });
            }

            dbg.log0('mount_points:', mount_points);
            self.params.root_path = mount_points[0].mount;

            dbg.log0('root path:', self.params.root_path);
            self.params.all_storage_paths = mount_points;

        }).then(function() {

            return self.load()
                .then(function() {
                    dbg.log0('COMPLETED: load');
                });
        }).then(null, function(err) {
            dbg.error('ERROR: load', self.params, err.stack);
            throw new Error(err);
        });
};

AgentCLI.prototype.init.helper = function() {
    dbg.log0("Init client");
};

/**
 *
 * LOAD
 *
 * create account, system, tier, bucket.
 *
 */
AgentCLI.prototype.load = function() {
    var self = this;
    dbg.log0('Loading agents', self.params.all_storage_paths);
    return P.all(_.map(self.params.all_storage_paths, function(storage_path_info) {
            var storage_path = storage_path_info.mount;

            return P.fcall(function() {
                    return P.nfcall(mkdirp, storage_path);
                })
                .then(function() {
                    return self.hide_storage_folder(storage_path);
                })
                .then(null, function(err) {
                    dbg.error('Windows - failed to hide', err.stack || err);
                    // TODO really continue on error?
                })
                .then(function() {
                    dbg.log0('root_path', storage_path);
                    return P.nfcall(fs.readdir, storage_path);
                })
                .then(function(nodes_names) {
                    dbg.log0('nodes_names:', nodes_names);
                    return P.all(_.map(nodes_names, function(node_name) {
                        dbg.log0('node_name', node_name, 'storage_path', storage_path);
                        var node_path = path.join(storage_path, node_name);
                        return self.start(node_name, node_path);
                    }));
                });
        }))
        .then(function(storage_path_nodes) {
            var nodes_count =
                parseInt(self.params.scale, 10) ||
                (self.params.prod && 1) ||
                0;
            var nodes_to_add = 0;
            // check if there is a new drive we can use.
            // in this case, storage_path_nodes will contain empty cell
            // for each new drive
            if (storage_path_nodes) {
                _.each(storage_path_nodes, function(curr_node_in_res) {
                    if (_.isEmpty(curr_node_in_res)) {
                        nodes_to_add = 1;
                    }
                });
            }

            if (nodes_to_add > 0) {
                nodes_to_add = 1;
                dbg.log0('AGENTS to create ', 1);
            } else {
                var default_path_nodes = storage_path_nodes[0];
                dbg.log0('AGENTS SCALE TO', nodes_count, 'storage_path_nodes', default_path_nodes);
                dbg.log0('AGENTS STARTED', default_path_nodes.length);
                if (nodes_count > default_path_nodes.length) {
                    nodes_to_add = nodes_count - default_path_nodes.length;
                }
            }
            if (nodes_to_add < 0) {
                dbg.warn('NODES SCALE DOWN IS NOT YET SUPPORTED ...');
            }
            if (nodes_to_add > 0) {
                return self.create_some(nodes_to_add);
            }
        })
        .then(null, function(err) {
            dbg.log0('load failed ' + err.stack);
            throw err;
        });


};

AgentCLI.prototype.hide_storage_folder = function(current_storage_path) {
    dbg.log0('os:', os.type());
    if (os.type().indexOf('Windows') >= 0) {
        var current_path = current_storage_path;
        current_path = current_path.substring(0, current_path.length - 1);
        current_path = current_path.replace('./', '');

        //hiding storage folder
        return P.nfcall(child_process.exec, 'attrib +H ' + current_path)
            .then(function() {
                //Setting system full permissions and remove builtin users permissions.
                //TODO: remove other users
                return P.nfcall(child_process.exec,
                    'icacls ' + current_path +
                    ' /t' +
                    ' /grant:r administrators:(oi)(ci)F' +
                    ' /grant:r system:F' +
                    ' /remove:g BUILTIN\\Users' +
                    ' /inheritance:r');
            });
    }
};

AgentCLI.prototype.load.helper = function() {
    dbg.log0("create token, start nodes ");
};

AgentCLI.prototype.create_node_helper = function(current_node_path_info) {
    var self = this;

    return P.fcall(function() {
        var current_node_path = current_node_path_info.mount;
        var node_name = os.hostname() + '-' + uuid();
        var path_modification = current_node_path.replace('/agent_storage/', '').replace('/', '').replace('.', '');
        //windows
        path_modification = path_modification.replace('\\agent_storage\\', '');


        var node_path = path.join(current_node_path, node_name);
        var token_path = path.join(node_path, 'token');
        dbg.log0('create_node_helper with path_modification', path_modification, 'node:', node_path, 'current_node_path', current_node_path, 'exists');

        if (os.type().indexOf('Windows') >= 0) {
            node_name = node_name + '-' + current_node_path_info.drive_id.replace(':', '');
        } else {
            if (!_.isEmpty(path_modification)) {
                node_name = node_name + '-' + path_modification.replace('/', '');
            }
        }
        dbg.log0('create new node for node name', node_name, ' path:', node_path, ' token path:', token_path);


        return fs_utils.file_must_not_exist(token_path)
            .then(function() {
                if (self.create_node_token) return;
                // authenticate and create a token for new nodes

                var basic_auth_params = _.pick(self.params,
                    'system', 'role');
                if (_.isEmpty(basic_auth_params)) {
                    throw new Error("No credentials");
                } else {
                    var secret_key = self.params.secret_key;
                    var auth_params_str = JSON.stringify(basic_auth_params);
                    var signature = self.s3.sign(secret_key, auth_params_str);
                    var auth_params = {
                        access_key: self.params.access_key,
                        string_to_sign: auth_params_str,
                        signature: signature,
                    };
                    if (self.params.tier) {
                        auth_params.extra = {
                            tier: self.params.tier,
                            node_path: node_path
                        };
                    }
                    dbg.log0('create_access_key_auth', auth_params);
                    return self.client.create_access_key_auth(auth_params);
                }
            })
            .then(function(res) {
                if (res) {
                    dbg.log0('result create:', res, 'node path:', node_path);
                    self.create_node_token = res.token;
                } else {
                    dbg.log0('has token', self.create_node_token);
                }
                return P.nfcall(mkdirp, node_path);
            }).then(function() {
                dbg.log0('writing token', token_path);
                return P.nfcall(fs.writeFile, token_path, self.create_node_token);
            })
            .then(function() {
                dbg.log0('about to start node', node_path, 'with node name:', node_name);
                return self.start(node_name, node_path);
            }).then(function(res) {
                dbg.log0('created', node_name);
                return res;
            }).then(null, function(err) {
                dbg.log0('create failed', node_name, err, err.stack);
                throw err;
            });
    });
};
/**
 *
 * CREATE
 *
 * create new node agent
 *
 */
AgentCLI.prototype.create = function() {
    var self = this;
    //create root path last
    return P.all(_.map(_.drop(self.params.all_storage_paths, 1), function(current_storage_path) {
            return fs_utils.list_directory(current_storage_path.mount)
                .then(function(files) {
                    if (files.length > 0) {
                        //multi drive path includes nodes data, no need to recreate a node, skip.
                        return;
                    } else {
                        return self.create_node_helper(current_storage_path);
                    }
                });
        }))
        .then(function() {
            //if multi drive, don't allow create more than one agent per drive
            if (self.params.all_storage_paths.length > 1) {
                return fs_utils.list_directory(self.params.all_storage_paths[0].mount)
                    .then(function(files) {
                        if (files.length > 0) {
                            //In case we have multiple drives, we will allow only one node
                            return;
                        } else {
                            return self.create_node_helper(self.params.all_storage_paths[0]);
                        }
                    });
            } else {
                return self.create_node_helper(self.params.all_storage_paths[0]);
            }
        })
        .then(null, function(err) {
            dbg.error('error while creating node:', err, err.stack);
        });
};

AgentCLI.prototype.create.helper = function() {
    dbg.log0("Create a new agent and start it");
};

/**
 *
 * CREATE_SOME
 *
 * create new node agent
 *
 */
AgentCLI.prototype.create_some = function(n) {
    var self = this;
    var sem = new Semaphore(5);
    return P.all(_.times(n, function() {
        return sem.surround(function() {
            return self.create();
        });
    }));
};

AgentCLI.prototype.create_some.helper = function() {
    dbg.log0("Create n agents:   create_some <n>");
};

/**
 *
 * START
 *
 * start agent
 *
 */
AgentCLI.prototype.start = function(node_name, node_path) {
    var self = this;
    dbg.log0('agent started ', node_path, node_name);

    var agent = self.agents[node_name];
    if (!agent) {

        agent = self.agents[node_name] = new Agent({
            address: self.params.address,
            node_name: node_name,
            storage_path: node_path,
            all_storage_paths: self.params.all_storage_paths,
        });

        dbg.log0('agent inited', node_name, self.params.addres, self.params.port, self.params.secure_port, node_path);
    }

    return P.fcall(function() {
        return promise_utils.retry(100, 1000, 1000, agent.start.bind(agent));
    }).then(function(res) {
        dbg.log0('agent started', node_name, 'res', res);
        return node_name;
    }, function(err) {
        dbg.log0('FAILED TO START AGENT', node_name, err);
        throw err;
    });
};

AgentCLI.prototype.start.helper = function() {
    dbg.log0("Start a specific agent, if agent doesn't exist, will create it:   start <agent>");
};

/**
 *
 * STOP
 *
 * stop agent
 *
 */
AgentCLI.prototype.stop = function(node_name) {
    var self = this;

    var agent = self.agents[node_name];
    if (!agent) {
        dbg.log0('agent not found', node_name);
        return;
    }

    agent.stop();
    dbg.log0('agent stopped', node_name);
};

AgentCLI.prototype.stop.helper = function() {
    dbg.log0("Stop a specific agent:   stop <agent>");
};

/**
 *
 * LIST
 *
 * list agents status
 *
 */
AgentCLI.prototype.list = function() {
    var self = this;

    var i = 1;
    _.each(self.agents, function(agent, node_name) {
        dbg.log0('#' + i, agent.is_started ? '<ok>' : '<STOPPED>',
            'node', node_name, 'address', agent.rpc_address);
        i++;
    });
};

AgentCLI.prototype.list.helper = function() {
    dbg.log0("List all agents status");
};


/**
 *
 * Show
 *
 * help for specific API
 *
 */

AgentCLI.prototype.show = function(func_name) {
    var func = this[func_name];
    var helper = func && func.helper;

    // in the common case the helper is a function - so call it
    if (typeof(helper) === 'function') {
        return helper.call(this);
    }

    // if helper is string or something else we just print it
    if (helper) {
        dbg.log0(helper);
    } else {
        dbg.log0('help not found for function', func_name);
    }
};

function populate_general_help(general) {
    general.push('show("<function>"") to show help on a specific API');
}

function main() {
    var cli = new AgentCLI(argv);
    cli.init().done(function() {
        if (argv.norepl) return;
        // start a Read-Eval-Print-Loop
        var repl_srv = repl.start({
            prompt: 'agent-cli > ',
            useGlobal: false
        });
        var help = {
            functions: [],
            variables: [],
            general: [],
        };
        _.forIn(cli, function(val, key) {
            if (typeof(val) === 'function') {
                repl_srv.context[key] = val.bind(cli);
                help.functions.push(key);
            } else {
                repl_srv.context[key] = val;
                help.variables.push(key);
            }
        });
        populate_general_help(help.general);
        repl_srv.context.help = help;
        repl_srv.context.dbg = dbg;
    }, function(err) {
        dbg.error('init err:' + err);
    });
}

if (require.main === module) {
    main();
}
