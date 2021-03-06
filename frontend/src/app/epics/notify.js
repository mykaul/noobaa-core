/* Copyright (C) 2016 NooBaa */

import { deepFreeze, ensureArray } from 'utils/core-utils';
import { getHostDisplayName } from 'utils/host-utils';
import { getServerDisplayName } from 'utils/cluster-utils';
import { unitsInBytes } from 'utils/size-utils';
import { showNotification } from 'action-creators';
import { empty } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import * as types from 'action-types';

// Used to decide if we should show a notifcation indicating that
// a package upload will take some time.
const largeUploadSizeThreshold = 10 * unitsInBytes.MEGABYTE;

const actionToNotification = deepFreeze({
    [types.FAIL_CREATE_ACCOUNT]: ({ accountName }) => ({
        message: `Creating account ${accountName} failed`,
        severity: 'error'
    }),

    [types.COMPLETE_UPDATE_ACCOUNT_S3_ACCESS]: ({ accountName }) => ({
        message: `${accountName} S3 access updated successfully`,
        severity: 'success'
    }),

    [types.FAIL_UPDATE_ACCOUNT_S3_ACCESS]: ({ accountName }) => ({
        message: `Updating ${accountName} S3 access failed`,
        severity: 'error'
    }),

    [types.COMPLETE_SET_ACCOUNT_IP_RESTRICTIONS]: ({ accountName }) => ({
        message: `IP restrictions for ${accountName} set successfully`,
        severity: 'success'
    }),

    [types.FAIL_SET_ACCOUNT_IP_RESTRICTIONS]: ({ accountName }) => ({
        message: `Setting IP restrictions for ${accountName} failed`,
        severity: 'error'
    }),

    [types.COMPLETE_CHANGE_ACCOUNT_PASSWORD]: ({ accountName }) => ({
        message: `${accountName} password changed successfully`,
        severity: 'success'
    }),

    [types.FAIL_CHANGE_ACCOUNT_PASSWORD]: ({ accountName }) => ({
        message: `Changing ${accountName} password failed`,
        severity: 'error'
    }),

    [types.COMPLETE_REGENERATE_ACCOUNT_CREDENTIALS]: ({ accountName }) => ({
        message: `${accountName} credentials regenerated successfully`,
        severity: 'success'
    }),

    [types.FAIL_REGENERATE_ACCOUNT_CREDENTIALS]: ({ accountName }) => ({
        message: `Regenerating ${accountName} credentials failed`,
        severity: 'error'
    }),

    [types.COMPLETE_ADD_EXTERNAL_CONNECTION]: ({ connection }) => ({
        message: `Adding ${connection} completed successfully`,
        severity: 'success'
    }),

    [types.FAIL_ADD_EXTERNAL_CONNECTION]: ({ connection }) => ({
        message: `Adding ${connection} failed`,
        severity: 'error'
    }),

    [types.COMPLETE_UPDATE_EXTERNAL_CONNECTION]: ({ connection }) => ({
        message: `Updating ${connection} completed successfully`,
        severity: 'success'
    }),

    [types.FAIL_UPDATE_EXTERNAL_CONNECTION]: ({ connection }) => ({
        message: `Updating ${connection} failed`,
        severity: 'error'
    }),

    [types.COMPLETE_DELETE_RESOURCE]: ({ resource }) => ({
        message: `Resource ${resource} deleted successfully`,
        severity: 'success'
    }),

    [types.FAIL_DELETE_RESOURCE]: ({ resource }) => ({
        message: `Resource ${resource} deletion failed`,
        severity: 'error'
    }),

    [types.COLLECT_HOST_DIAGNOSTICS]: ({ host }) => ({
        message: `Collecting diagnostic for ${getHostDisplayName(host)}, it may take a few seconds`,
        severity: 'success'
    }),

    [types.FAIL_COLLECT_HOST_DIAGNOSTICS]: ({ host }) => ({
        message: `Collecting diagnostic file for ${getHostDisplayName(host)} failed`,
        severity: 'error'
    }),

    [types.COMPLETE_SET_HOST_DEBUG_MODE]: ({ host, on }) => ({
        message: `Debug mode was turned ${on ? 'on' : 'off'} for node ${getHostDisplayName(host)}`,
        severity: 'success'
    }),

    [types.FAIL_SET_HOST_DEBUG_MODE]: ({ host, on }) => ({
        message: `Could not turn ${on ? 'on' : 'off'} debug mode for node ${getHostDisplayName(host)}`,
        severity: 'error'
    }),

    [types.COMPLETE_CREATE_HOSTS_POOL]: ({ name }) => ({
        message: `Pool ${name} created successfully`,
        severity: 'success'
    }),

    [types.FAIL_CREATE_HOSTS_POOL]: ({ name }) => ({
        message: `Pool ${name} creation failed`,
        severity: 'error'
    }),

    [types.COMPLETE_SCALE_HOSTS_POOL]: ({ poolName }) => ({
        message: `Pool ${poolName} updated successfully`,
        severity: 'success'
    }),

    [types.FAIL_SCALE_HOSTS_POOL]: ({ poolName }) => ({
        message: `Pool ${poolName} update failed`,
        severity: 'error'
    }),

    [types.COMPLETE_DELETE_ACCOUNT]: ({ email }) => ({
        message: `Account ${email} deleted successfully`,
        severity: 'success'
    }),

    [types.FAIL_DELETE_ACCOUNT]: ({ email }) => ({
        message: `Account ${email} deletion failed`,
        severity: 'error'
    }),

    [types.COMPLETE_DELETE_EXTERNAL_CONNECTION]: ({ connection }) => ({
        message: `Connection ${connection} deleted successfully`,
        severity: 'success'
    }),

    [types.FAIL_DELETE_EXTERNAL_CONNECTION]: ({ connection }) => ({
        message: `Connection ${connection} deletion failed`,
        severity: 'error'
    }),

    [types.COMPLETE_CREATE_NAMESPACE_RESOURCE]: ({ name }) => ({
        message: `Namespace resource ${name} created successfully`,
        severity: 'success'
    }),

    [types.FAIL_CREATE_NAMESPACE_RESOURCE]: ({ name }) => ({
        message: `Namespace resource ${name} creation failed`,
        severity: 'error'
    }),

    [types.COMPLETE_DELETE_NAMESPACE_RESOURCE]: ({ name }) => ({
        message: `Namespace resource ${name} deleted successfully`,
        severity: 'success'
    }),

    [types.FAIL_DELETE_NAMESPACE_RESOURCE]: ({ name }) => ({
        message: `Namespace resource ${name} deletion failed`,
        severity: 'error'
    }),

    [types.COMPLETE_UPDATE_BUCKET_QUOTA_POLICY]: ({ bucket }) => ({
        message: `${bucket} quota updated successfully`,
        severity: 'success'
    }),

    [types.FAIL_UPDATE_BUCKET_QUOTA_POLICY]: ({ bucket }) => ({
        message: `Updating quota for ${bucket} failed`,
        severity: 'error'
    }),

    [types.COMPLETE_UPDATE_TIER_PLACEMENT_POLICY]: ({ bucket }) => ({
        message: `${bucket} placement policy updated successfully`,
        severity: 'success'
    }),

    [types.FAIL_UPDATE_TIER_PLACEMENT_POLICY]: ({ bucket }) => ({
        message: `Updating ${bucket} placement policy failed`,
        severity: 'error'
    }),

    [types.COMPLETE_UPDATE_BUCKET_RESILIENCY_POLICY]: ({ bucket }) => ({
        message: `${bucket} resiliency policy updated successfully`,
        severity: 'success'
    }),

    [types.FAIL_UPDATE_BUCKET_RESILIENCY_POLICY]: ({ bucket }) => ({
        message: `Updating ${bucket} resiliency policy failed`,
        severity: 'error'
    }),

    [types.COMPLETE_UPDATE_BUCKET_VERSIONING_POLICY]: ({ bucket, versioning }) => {
        const action =
            (versioning === 'ENABLED' && 'enabled') ||
            (versioning === 'SUSPENDED' && 'suspended');

        return {
            message: `${bucket} versioning ${action} successfully`,
            severity: 'success'
        };
    },

    [types.FAIL_UPDATE_BUCKET_VERSIONING_POLICY]: ({ bucket, versioning }) => {
        const action =
            (versioning === 'ENABLED' && 'Enabling') ||
            (versioning === 'SUSPENDED' && 'Suspending');

        return {
            message: `${action} ${bucket} versioning failed`,
            severity: 'error'
        };
    },

    [types.COMPLETE_ADD_BUCKET_TIER]: ({ bucket }) => ({
        message: `A tier was added to bucket ${bucket} successfully`,
        severity: 'success'
    }),

    [types.FAIL_ADD_BUCKET_TIER]: ({ bucket }) => ({
        message: `Adding a tier to bucket ${bucket} failed`,
        severity: 'error'
    }),

    [types.COMPLETE_DELETE_BUCKET]: ({ bucket }) => ({
        message: `Bucket ${bucket} deleted successfully`,
        severity: 'success'
    }),

    [types.FAIL_DELETE_BUCKET]: ({ bucket }) => ({
        message: `Bucket ${bucket} deletion failed`,
        severity: 'error'
    }),

    [types.COMPLETE_CREATE_NAMESPACE_BUCKET]: ({ name }) =>({
        message: `Namespace bucket ${name} created successfully`,
        severity: 'success'
    }),

    [types.FAIL_CREATE_NAMESPACE_BUCKET]: ({ name }) => ({
        message: `Namespace bucket ${name} creation failed`,
        severity: 'error'
    }),

    [types.COMPLETE_UPDATE_NAMESPACE_BUCKET_PLACEMENT]: ({ name }) => ({
        message: `Namespace bucket ${name} placement policy updated successfully`,
        severity: 'success'
    }),

    [types.FAIL_UPDATE_NAMESPACE_BUCKET_PLACEMENT]: ({ name }) => ({
        message: `Updating namespace bucket ${name} placement policy failed`,
        severity: 'error'
    }),

    [types.COMPLETE_DELETE_NAMESPACE_BUCKET]: ({ name }) => ({
        message: `Namespace bucket ${name} deleted successfully`,
        severity: 'success'
    }),

    [types.FAIL_DELETE_NAMESPACE_BUCKET]: ({ name }) => ({
        message: `Namespace bucket ${name} deletion failed`,
        severity: 'error'
    }),

    [types.COMPLETE_RETRUST_HOST]: ({ host }) => ({
        message: `Node ${host} was set as trusted successfully`,
        severity: 'success'
    }),

    [types.FAIL_RETRUST_HOST]: ({ host }) => ({
        message: `Set node ${host} as trusted failed `,
        severity: 'error'
    }),

    [types.COMPLETE_DELETE_OBJECT]: ({ objId }) => {
        const name = objId.version ?
            `${objId.key} (${objId.version})` :
            objId.key;

        return {
            message: `File ${name} deleted successfully`,
            severity: 'success'
        };
    },

    [types.FAIL_DELETE_OBJECT]: ({ objId }) => {
        const name = objId.version ?
            `${objId.key} (${objId.version})` :
            objId.key;

        return {
            message: `File ${name} deletion failed`,
            severity: 'error'
        };
    },

    [types.COMPLETE_UPDATE_SERVER_ADDRESS]: ({ secret, hostname }) => ({
        message: `${getServerDisplayName({ secret, hostname })} cluster connectivity IP updated successfully`,
        severity: 'success'
    }),

    [types.FAIL_UPDATE_SERVER_ADDRESS]: ({ secret, hostname }) => ({
        message: `Updating cluster connectivity IP for ${getServerDisplayName({ secret, hostname })} failed`,
        severity: 'error'
    }),

    [types.COMPLETE_UPDATE_BUCKET_S3_ACCESS]: ({ bucketName }) => ({
        message: `${bucketName} S3 access control updated successfully`,
        severity: 'success'
    }),

    [types.FAIL_UPDATE_BUCKET_S3_ACCESS]: ({ bucketName }) => ({
        message: `Updating ${bucketName} S3 access control failed`,
        severity: 'error'
    }),

    [types.COMPLETE_ADD_BUCKET_TRIGGER]: ({ bucketName }) => ({
        message: `A trigger added to ${bucketName} successfully`,
        severity: 'success'
    }),

    [types.FAIL_ADD_BUCKET_TRIGGER]: ({ bucketName }) => ({
        message: `Adding a trigger to ${bucketName} failed`,
        severity: 'error'
    }),

    [types.COMPLETE_UPDATE_BUCKET_TRIGGER]: ({ displayEntity }) => ({
        message: `A trigger updated for ${displayEntity} successfully`,
        severity: 'success'
    }),

    [types.FAIL_UPDATE_BUCKET_TRIGGER]: ({ displayEntity }) => ({
        message: `Updating a trigger for ${displayEntity} failed`,
        severity: 'error'
    }),

    [types.COMPLETE_REMOVE_BUCKET_TRIGGER]: ({ bucketName }) => ({
        message: `A trigger removed from ${bucketName} successfully`,
        severity: 'success'
    }),

    [types.FAIL_REMOVE_BUCKET_TRIGGER]: ({ bucketName }) => ({
        message: `Removing a trigger from ${bucketName} failed`,
        severity: 'error'
    }),

    [types.COMPLETE_ATTACH_SERVER_TO_CLUSTER]: ({ secret }) => ({
        message: `Attaching a new server (secret: ${secret}) to the cluster, this might take a few moments`,
        severity: 'info'
    }),

    [types.FAIL_ATTACH_SERVER_TO_CLUSTER]: ({ secret }) => ({
        message: `Attaching a new server (secret: ${secret}) to the cluster failed`,
        severity: 'error'
    }),

    [types.COMPLETE_CREATE_CLOUD_RESOURCE]: ({ name }) => ({
        message: `Cloud resource ${name} created successfully`,
        severity: 'success'
    }),

    [types.FAIL_CREATE_CLOUD_RESOURCE]: ({ name }) => ({
        message: `Cloud resource ${name} creation failed`,
        severity: 'error'
    }),

    [types.CREATE_LAMBDA_FUNC]: ({ codeBufferSize }) => {
        if (codeBufferSize < largeUploadSizeThreshold) {
            return;
        }

        return {
            message: 'Uploading a large function package, it may take a few moments',
            severity: 'info'
        };
    },

    [types.COMPLETE_CREATE_LAMBDA_FUNC]: ({ name }) => ({
        message: `Function ${name} created successfully`,
        severity: 'success'
    }),

    [types.FAIL_CREATE_LAMBDA_FUNC]: ({ name }) => ({
        message: `Creating function ${name} failed`,
        severity: 'error'
    }),

    [types.COMPLETE_DELETE_LAMBDA_FUNC]: ({ name }) => ({
        message: `Function ${name} deleted successfully`,
        severity:'success'
    }),

    [types.FAIL_DELETE_LAMBDA_FUNC]: ({ name }) => ({
        message: `Function ${name} deletion failed`,
        severity: 'error'
    }),

    [types.COMPLETE_UPDATE_LAMBDA_FUNC_CONFIG]: ({ name }) => ({
        message: `${name} configuration updated successfully`,
        severity: 'success'
    }),

    [types.FAIL_UPDATE_LAMBDA_FUNC_CONFIG]: ({ name }) => ({
        message: `Updating ${name} configuration failed`,
        severity: 'error'
    }),

    [types.COMPLETE_INVOKE_LAMBDA_FUNC]: ({ name, error, result }) => {
        if (error) {
            return {
                message: `${name} invoked but returned error: ${error.message}`,
                severity: 'warning'
            };

        } else {
            return {
                message: `${name} invoked successfully result: ${JSON.stringify(result)}`,
                severity: 'success'
            };
        }
    },

    [types.UPDATE_LAMBDA_FUNC_CODE]: ({ bufferHandle, bufferSize }) => {
        if (bufferHandle === null || bufferSize < largeUploadSizeThreshold) {
            return;
        }

        return {
            message: 'Uploading a large function package, it may take a few moments',
            severity: 'info'
        };
    },

    [types.COMPLETE_UPDATE_LAMBDA_FUNC_CODE]: ({ name }) => ({
        message: `${name} code updated successfully`,
        severity: 'success'
    }),

    [types.FAIL_UPDATE_LAMBDA_FUNC_CODE]: ({ name }) => ({
        message: `Updating ${name} code  updated failed`,
        severity: 'error'
    }),

    [types.FAIL_INVOKE_LAMBDA_FUNC]: ({ name  }) => ({
        message: `${name} invocation failed`,
        severity: 'error'
    }),

    [types.FAIL_ENTER_MAINTENANCE_MODE]: () => ({
        message: 'Entering maintenance mode failed',
        severity: 'error'
    }),

    [types.FAIL_LEAVE_MAINTENANCE_MODE]: () => ({
        message: 'Leaving maintenance mode failed',
        severity: 'error'
    }),

    [types.COMPLETE_CREATE_BUCKET]: ({ name }) => ({
        message: `Bucket ${name} created successfully`,
        severity: 'success'
    }),

    [types.FAIL_CREATE_BUCKET]: ({ name }) => ({
        message: `Bucket ${name} creation failed`,
        severity: 'error'
    }),

    [types.COMPLETE_ASSIGN_REGION_TO_RESOURCE]: ({ resourceName, region }) => ({
        message: `A region was ${region ? 'assigned to' : 'removed from'} ${resourceName} successfully`,
        severity: 'success'
    }),

    [types.FAIL_ASSIGN_REGION_TO_RESOURCE]: ({ resourceName, region }) => ({
        message: `Failed to ${region ? 'assign a region to' : 'remove a region from'} ${resourceName}`,
        severity: 'error'
    }),

    [types.COMPLETE_UPDATE_P2P_SETTINGS]: () => ({
        message: 'Peer to peer settings updated successfully',
        severity: 'success'
    }),

    [types.FAIL_UPDATE_P2P_SETTINGS]: () => ({
        message: 'Peer to peer settings update failed',
        severity: 'error'
    }),

    [types.FAIL_SET_SYSTEM_DEBUG_LEVEL]: ({ level }) => ({
        message: `Setting system debug level to ${level} failed`,
        severity: 'error'
    }),

    [types.COMPLETE_UPDATE_SERVER_DETAILS]: ({ hostname }) => ({
        message: `${hostname} details updated successfully`,
        severity: 'success'
    }),

    [types.FAIL_UPDATE_SERVER_DETAILS]: ({ hostname }) => ({
        message: `Updating ${hostname} details failed`,
        severity: 'error'
    }),

    [types.FAIL_UPLOAD_SSL_CERTIFICATE]: ({ error }) => ({
        message: `Uploading SSL cartificate failed: ${error.message}`,
        severity: 'error'
    }),

    [types.FAIL_EXPORT_AUDIT_LOG]: () => ({
        message: 'Exporting audit log failed',
        severity: 'error'
    })
});

export default function(action$) {
    return action$.pipe(
        mergeMap(action => {
            const generator = actionToNotification[action.type];
            if (generator){
                return ensureArray(generator(action.payload))
                    .map(notif => showNotification(notif.message, notif.severity));
            } else {
                return empty();
            }
        })
    );
}
