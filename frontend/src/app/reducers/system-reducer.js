/* Copyright (C) 2016 NooBaa */

import { createReducer } from 'utils/reducer-utils';
import {
    COMPLETE_FETCH_SYSTEM_INFO,
    FETCH_VERSION_RELEASE_NOTES,
    COMPLETE_FETCH_VERSION_RELEASE_NOTES,
    FAIL_FETCH_VERSION_RELEASE_NOTES,
    COLLECT_SYSTEM_DIAGNOSTICS,
    COMPLETE_COLLECT_SYSTEM_DIAGNOSTICS,
    FAIL_COLLECT_SYSTEM_DIAGNOSTICS,
    UPLOAD_SSL_CERTIFICATE,
    UPDATE_UPLOAD_SSL_CERTIFICATE,
    COMPLETE_UPLOAD_SSL_CERTIFICATE,
    FAIL_UPLOAD_SSL_CERTIFICATE
} from 'action-types';

// ------------------------------
// Initial State
// ------------------------------
const initialState = undefined;

const diagnosticsInitialState = {
    collecting: false,
    error: false,
    packageUri: ''
};

// ------------------------------
// Action Handlers
// ------------------------------
function onCompleteFetchSystemInfo(state, { payload, timestamp }) {
    const internalStorage = _mapInternalStorage(payload.pools.find(pool =>
        pool.resource_type === 'INTERNAL'
    ));

    return {
        name: payload.name,
        version: payload.version,
        nodeVersion: payload.node_version,
        dnsName: payload.dns_name,
        ipAddress: payload.ip_address,
        sslPort: Number(payload.ssl_port),
        sslCert: _mapSSLCert(state, Boolean(payload.has_ssl_cert)),
        upgrade: _mapUpgrade(payload),
        p2pSettings: _mapP2PSettings(payload),
        phoneHome:_mapPhoneHome(payload),
        debug: _mapDebug(payload, timestamp),
        maintenanceMode: _mapMaintenanceMode(payload, timestamp),
        releaseNotes: state && state.releaseNotes,
        diagnostics: state ? state.diagnostics : diagnosticsInitialState,
        internalStorage,
        s3Endpoints: payload.s3_endpoints
    };
}

function onFetchVersionReleaseNotes(state, { payload }) {
    const { version } = payload;
    const releaseNotes = {
        ...state.releaseNotes || {},
        [version]: {
            fetching: true
        }
    };

    return {
        ...state,
        releaseNotes
    };
}

function onCompleteFetchVersionReleaseNotes(state, { payload }) {
    const { version, notes } = payload;
    const releaseNotes = {
        ...state.releaseNotes,
        [version]: {
            fetching: false,
            text: notes
        }
    };

    return {
        ...state,
        releaseNotes
    };
}

function onFailFetchVersionReleaseNotes(state, { payload }) {
    const { version } = payload;
    const releaseNotes = {
        ...state.releaseNotes,
        [version]: {
            fetching: false,
            error: true
        }
    };

    return {
        ...state,
        releaseNotes
    };
}

function onCollectSystemDiagnostics(state) {
    return {
        ...state,
        diagnostics: {
            collecting: true,
            error: false,
            packageUri: ''
        }
    };
}

function onCompleteCollectSystemDiagnostics(state, { payload }) {
    return {
        ...state,
        diagnostics: {
            collecting: false,
            error: false,
            packageUri: payload.packageUri
        }
    };
}

function onFailCollectSystemDiagnostics(state) {
    return {
        ...state,
        diagnostics: {
            collecting: false,
            error: true,
            packageUri: ''
        }
    };
}

function onUploadCertificate(state) {
    return {
        ...state,
        sslCert: {
            ...state.sslCert,
            uploadProgress: 0
        }
    };
}

function onUpdateUploadCertificate(state, { payload }) {
    return {
        ...state,
        sslCert: {
            ...state.sslCert,
            uploadProgress: payload.progress
        }
    };
}

function onCompleteUploadCertificate(state) {
    const { uploadProgress, ...sslCert } = state.sslCert;
    return {
        ...state,
        sslCert
    };
}

function onFailUploadCertificate(state) {
    const { uploadProgress, ...sslCert } = state.sslCert;
    return {
        ...state,
        sslCert
    };
}



// ------------------------------
// Local util functions
// ------------------------------
function _mapSSLCert(state, isCertInstalled) {
    return {
        ...(state ? state.sslCert : {}),
        installed: isCertInstalled
    };
}

function _mapUpgrade(payload) {
    const { last_upgrade } = payload.upgrade;

    // DZDZ - hardcoded initiator - not relevant anymore
    return {
        lastUpgrade: last_upgrade && {
            time:last_upgrade.timestamp,
            initiator: 'operator@noobaa.io'
        }
    };
}

function _mapP2PSettings(payload) {
    const { port, min, max } = payload.n2n_config.tcp_permanent_passive;
    return {
        tcpPortRange: {
            start: min || port || 1,
            end: max || port || 1
        }
    };
}

function _mapPhoneHome(payload) {
    const reachable = !payload.phone_home_config.phone_home_unable_comm;
    return { reachable };
}

function _mapDebug(payload, timestamp) {
    const { level, time_left } = payload.debug;
    const till = time_left ?  timestamp + time_left : 0;
    return { level, till };
}

function _mapMaintenanceMode(payload, timestamp) {
    const { state, time_left } = payload.maintenance_mode;
    const till = state ? timestamp + time_left : 0;
    return { till };
}

function _mapInternalStorage(internalResource) {
    const { total = 0, used = 0, free = 0 } = internalResource ?
        internalResource.storage :
        {};

    return { total, used, free };
}

// ------------------------------
// Exported reducer function
// ------------------------------
export default createReducer(initialState, {
    [COMPLETE_FETCH_SYSTEM_INFO]: onCompleteFetchSystemInfo,
    [FETCH_VERSION_RELEASE_NOTES]: onFetchVersionReleaseNotes,
    [COMPLETE_FETCH_VERSION_RELEASE_NOTES]: onCompleteFetchVersionReleaseNotes,
    [FAIL_FETCH_VERSION_RELEASE_NOTES]: onFailFetchVersionReleaseNotes,
    [COLLECT_SYSTEM_DIAGNOSTICS]: onCollectSystemDiagnostics,
    [COMPLETE_COLLECT_SYSTEM_DIAGNOSTICS]: onCompleteCollectSystemDiagnostics,
    [FAIL_COLLECT_SYSTEM_DIAGNOSTICS]: onFailCollectSystemDiagnostics,
    [UPLOAD_SSL_CERTIFICATE]: onUploadCertificate,
    [UPDATE_UPLOAD_SSL_CERTIFICATE]: onUpdateUploadCertificate,
    [COMPLETE_UPLOAD_SSL_CERTIFICATE]: onCompleteUploadCertificate,
    [FAIL_UPLOAD_SSL_CERTIFICATE]: onFailUploadCertificate
});
