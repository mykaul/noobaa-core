#!/bin/bash

NODE_DL="http://nodejs.org/dist/v0.10.33/node-v0.10.33.tar.gz"
TURN_DL="http://turnserver.open-sys.org/downloads/v4.3.1.3/turnserver-4.3.1.3-CentOS6.6-x86_64.tar.gz"
CORE_DIR="/root/node_modules/noobaa-core"
CONFIG_JS="${CORE_DIR}/config.js"
ENV_FILE="${CORE_DIR}/.env"
LOG_FILE="/var/log/noobaa_deploy.log"
SUPERD="/usr/bin/supervisord"
SUPERCTL="/usr/bin/supervisorctl"

function deploy_log {
	if [ $1 != "" ]; then
			local now=$(date)
			echo "${now} ${1}" >> ${LOG_FILE}
	fi
}

function build_node {
	deploy_log "build_node start"
	yum -y groupinstall "Development Tools"

	#Install Node.js / NPM
	cd /usr/src
	curl ${NODE_DL} > node-v0.10.33.tar.gz || true
	tar zxf node-v0.10.33.tar.gz
	cd node-v0.10.33
	./configure
	make
	make install
	cd ~
	deploy_log "build_node done"
}

function install_aux {
	deploy_log "install_aux start"
	# Install Debug packages
	yum install -y tcpdump

	# Install Supervisord
	yum install -y python-setuptools
	easy_install supervisor

	# Install STUN/TURN
  cd /tmp
  curl -sL ${TURN_DL} | tar -xzv
  cd /tmp/turnserver-4.3.1.3
	/tmp/turnserver-4.3.1.3/install.sh
	cd ~
	deploy_log "install_aux done"
}

function install_repos {
	deploy_log "install_repos start"
	mkdir -p ${CORE_DIR}
	mv /tmp/noobaa-NVA.tar.gz ${CORE_DIR}
	cd ${CORE_DIR}
	tar -xzvf ./noobaa-NVA.tar.gz
	cd ~
	deploy_log "install_repos done"
}

function setup_repos {
	deploy_log "setup_repos start"
	cd ~
	# Setup Repos
	cp -f ${CORE_DIR}/src/deploy/NVA_build/.env ${CORE_DIR}
	cd ${CORE_DIR}
	npm_log=$(npm install --unsafe-perm -dd)
	deploy_log "npm install ${npm_log}"

	# Setup config.js with on_premise configuration
	cat ${CONFIG_JS} | sed "s:config.on_premise.enabled = false:config.on_premise.enabled = true:" > ${CONFIG_JS}

	# Setup crontab job for upgrade checks
	# once a day at HH = midnight + RAND[0,2], MM = RAND[0,59]
	local hour_skew=$(((RANDOM)%3))
	local minutes=$(((RANDOM)%60))
	crontab -l 2>/dev/null; echo "${minutes} ${hour_skew} * * * ${CORE_DIR}/src/deploy/NVA_build/upgrade.sh" | crontab -
	deploy_log "setup_repos done"
}

function install_mongo {
	deploy_log "install_mongo start"
	# create a Mongo 2.4 Repo file
	cp ./mongo.repo /etc/yum.repos.d/mongodb-org-2.4.repo

	# install the needed RPM
	yum install -y mongo-10gen.x86_64 mongo-10gen-server.x86_64

	# pin mongo version in yum, so it won't auto update
	echo "exclude=mongodb-org,mongodb-org-server,mongodb-org-shell,mongodb-org-mongos,mongodb-org-tools" >> /etc/yum.conf
	deploy_log "install_mongo done"
}

function setup_mongo {
	deploy_log "setup_mongo start"
	mkdir /data
	mkdir /data/db
	#add mongod to rc.d
	chkconfig mongod on
	deploy_log "setup_mongo done"
}

function setup_supervisors {
	deploy_log "setup_supervisors start"
	# Generate default supervisord config
	echo_supervisord_conf > /etc/supervisord.conf

	# Autostart supervisor
	cp -f ./supervisord /etc/rc.d/init.d/supervisord
	chmod 777 /etc/rc.d/init.d/supervisord
	chkconfig supervisord on

	# Add NooBaa services configuration to supervisor
	echo "[include]" >> /etc/supervisord.conf
	echo "files = /etc/noobaa_supervisor.conf" >> /etc/supervisord.conf
	cp -f ./noobaa_supervisor.conf /etc
	${SUPERCTL} reread
	${SUPERCTL} update
	deploy_log "setup_supervisors done"
}

if [ "$1" == "runinstall" ]; then
	deploy_log "Running with runinstall"
	set -e
	build_node
	install_aux
	install_repos
	setup_repos
	install_mongo
	setup_mongo
	setup_supervisors
fi
