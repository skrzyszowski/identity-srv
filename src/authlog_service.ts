import { ServiceBase, ResourcesAPIBase, FilterOperation } from '@restorecommerce/resource-base-interface';
import { Logger } from 'winston';
import { ACSAuthZ, AuthZAction, Decision, Subject, DecisionResponse, PolicySetRQResponse, Operation } from '@restorecommerce/acs-client';
import { Topic } from '@restorecommerce/kafka-client';
import { checkAccessRequest, returnOperationStatus } from './utils';
import * as _ from 'lodash';

export class AuthenticationLogService extends ServiceBase {
  logger: Logger;
  cfg: any;
  authZ: ACSAuthZ;
  constructor(cfg: any, db: any, authLogTopic: Topic, logger: any,
    isEventsEnabled: boolean, authZ: ACSAuthZ) {
    super('authentication_log', authLogTopic, logger, new ResourcesAPIBase(db, 'authentication_logs'), isEventsEnabled);
    this.logger = logger;
    this.authZ = authZ;
    this.cfg = cfg;
  }

  async create(call: any, context: any): Promise<any> {
    if (!call || !call.request || !call.request.items || call.request.items.length == 0) {
      return returnOperationStatus(400, 'No role was provided for creation');
    }

    let subject = call.request.subject;
    call.request.items = await this.createMetadata(call.request.items, AuthZAction.CREATE, subject);
    return super.create(call, context);
  }

  /**
   * Extends ServiceBase.read()
   * @param  {any} call request contains read request
   * @param {context}
   * @return type is any since it can be guest or user type
   */
  async read(call: any, context: any): Promise<any> {
    const readRequest = call.request;
    let subject = call.request.subject;
    let acsResponse: PolicySetRQResponse;
    try {
      if (!context) { context = {}; };
      context.subject = subject;
      context.resources = [];
      acsResponse = await checkAccessRequest(context, [{ resource: 'authentication_log' }], AuthZAction.READ,
        Operation.whatIsAllowed);
    } catch (err) {
      this.logger.error('Error occurred requesting access-control-srv for authentication_log read', err);
      return returnOperationStatus(err.code, err.message);
    }
    if (acsResponse.decision != Decision.PERMIT) {
      return { operation_status: acsResponse.operation_status };
    }

    if (acsResponse?.custom_query_args && acsResponse.custom_query_args.length > 0) {
      readRequest.custom_queries = acsResponse.custom_query_args[0].custom_queries;
      readRequest.custom_arguments = acsResponse.custom_query_args[0].custom_arguments;
    }
    if (acsResponse.decision === Decision.PERMIT) {
      return await super.read({ request: readRequest });
    }
  }

  /**
   * Extends the generic update operation in order to update any fields
   * @param call
   * @param context
   */
  async update(call: any, context: any): Promise<any> {
    if (_.isNil(call) || _.isNil(call.request) || _.isNil(call.request.items)
      || _.isEmpty(call.request.items)) {
      return returnOperationStatus(400, 'No items were provided for update');
    }

    let items = call.request.items;
    let subject = call.request.subject;
    // update owner information
    items = await this.createMetadata(call.request.items, AuthZAction.MODIFY, subject);
    let acsResponse: DecisionResponse;
    try {
      if (!context) { context = {}; };
      context.subject = subject;
      context.resources = items;
      acsResponse = await checkAccessRequest(context, [{ resource: 'authentication_log', id: items.map(e => e.id) }],
        AuthZAction.MODIFY, Operation.isAllowed);
    } catch (err) {
      this.logger.error('Error occurred requesting access-control-srv for authentication_log update', err);
      return returnOperationStatus(err.code, err.message);
    }

    if (acsResponse.decision != Decision.PERMIT) {
      return { operation_status: acsResponse.operation_status };
    }

    if (acsResponse.decision === Decision.PERMIT) {
      for (let i = 0; i < items.length; i += 1) {
        // read the role from DB and check if it exists
        const auth_log = items[i];
        const filters = [{
          filter: [{
            field: 'id',
            operation: FilterOperation.eq,
            value: auth_log.id
          }]
        }];
        const auth_logs = await super.read({ request: { filters } }, context);
        if (auth_logs.total_count === 0) {
          return returnOperationStatus(400, 'roles not found for updating');
        }
        const authLogDB = auth_logs.data.items[0];
        // update meta information from existing Object in case if its
        // not provided in request
        if (!auth_log.meta) {
          auth_log.meta = authLogDB.meta;
        } else if (auth_log.meta && _.isEmpty(auth_log.meta.owner)) {
          auth_log.meta.owner = authLogDB.meta.owner;
        }
        // check for ACS if owner information is changed
        if (!_.isEqual(auth_log.meta.owner, authLogDB.meta.owner)) {
          let acsResponse: DecisionResponse;
          try {
            if (!context) { context = {}; };
            context.subject = subject;
            context.resources = auth_log;
            acsResponse = await checkAccessRequest(subject, [{ resource: 'authentication_log', id: auth_log.id }], AuthZAction.MODIFY,
              Operation.isAllowed, false);
          } catch (err) {
            this.logger.error('Error occurred requesting access-control-srv for authentication_log update', err);
            return returnOperationStatus(err.code, err.message);
          }
          if (acsResponse.decision != Decision.PERMIT) {
            return { operation_status: acsResponse.operation_status };
          }
        }
      }
      return super.update(call, context);
    }
  }

  /**
   * Extends the generic upsert operation in order to upsert any fields
   * @param call
   * @param context
   */
  async upsert(call: any, context: any): Promise<any> {
    if (_.isNil(call) || _.isNil(call.request) || _.isNil(call.request.items)
      || _.isEmpty(call.request.items)) {
      return returnOperationStatus(400, 'No items were provided for upsert');
    }

    let subject = call.request.subject;
    call.reqeust.items = await this.createMetadata(call.request.items, AuthZAction.MODIFY, subject);
    let acsResponse: DecisionResponse;
    try {
      if (!context) { context = {}; };
      context.subject = subject;
      context.resources = call.request.items;
      acsResponse = await checkAccessRequest(context, [{ resource: 'authentication_log', id: call.request.items.map(e => e.id) }],
        AuthZAction.MODIFY, Operation.isAllowed);
    } catch (err) {
      this.logger.error('Error occurred requesting access-control-srv for authentication_log upsert', err);
      return returnOperationStatus(err.code, err.message);
    }

    if (acsResponse.decision != Decision.PERMIT) {
      return { operation_status: acsResponse.operation_status };
    }

    if (acsResponse.decision === Decision.PERMIT) {
      return super.upsert(call, context);
    }
  }

  /**
   * Endpoint delete, to delete a role or list of roles
   * @param  {any} call request containing list of userIds or collection name
   * @param {any} context
   * @return {} returns empty response
   */
  async delete(call: any, context: any): Promise<any> {
    const request = call.request;
    const logger = this.logger;
    let authLogIDs = request.ids;
    let resources = {};
    let subject = call.request.subject;
    let acsResources;
    if (authLogIDs) {
      Object.assign(resources, { id: authLogIDs });
      acsResources = await this.createMetadata({ id: authLogIDs }, AuthZAction.DELETE, subject);
    }
    if (call.request.collection) {
      acsResources = [{ collection: call.request.collection }];
    }
    let acsResponse: DecisionResponse;
    try {
      if (!context) { context = {}; };
      context.subject = subject;
      context.resources = acsResources;
      acsResponse = await checkAccessRequest(subject, [{resource: 'authentication_log', id: authLogIDs }],
        AuthZAction.DELETE, Operation.isAllowed);
    } catch (err) {
      this.logger.error('Error occurred requesting access-control-srv for authentication_log delete', err);
      return returnOperationStatus(err.code, err.message);
    }

    if (acsResponse.decision != Decision.PERMIT) {
      return { operation_status: acsResponse.operation_status };
    }

    if (acsResponse.decision === Decision.PERMIT) {
      if (request.collection) {
        // delete collection and return
        const serviceCall = {
          request: {
            collection: request.collection
          }
        };
        const deleteResponse = await super.delete(serviceCall, context);
        logger.info('AuthenticationLog collection deleted:');
        return deleteResponse;
      }
      if (!_.isArray(authLogIDs)) {
        authLogIDs = [authLogIDs];
      }
      logger.silly('deleting Role IDs:', { authLogIDs });
      // Check each user exist if one of the user does not exist throw an error
      for (let authLogID of authLogIDs) {
        const filters = [{
          filter: [{
            field: 'id',
            operation: FilterOperation.eq,
            value: authLogID
          }]
        }];
        const roles = await super.read({ request: { filters } }, context);
        if (roles.total_count === 0) {
          logger.debug('AuthLog does not exist for deleting:', { authLogID });
          return returnOperationStatus(400, `AuthLog with ${authLogID} does not exist for deleting`);
        }
      }
      // delete users
      const serviceCall = {
        request: {
          ids: authLogIDs
        }
      };
      const deleteResponse = await super.delete(serviceCall, context);
      logger.info('AuthenticationLogs deleted:', { authLogIDs });
      return deleteResponse;
    }
  }

  /**
   * reads meta data from DB and updates owner information in resource if action is UPDATE / DELETE
   * @param reaources list of resources
   * @param entity entity name
   * @param action resource action
   */
  async createMetadata(res: any, action: string, subject?: Subject): Promise<any> {
    let resources = _.cloneDeep(res);
    let orgOwnerAttributes = [];
    if (!_.isArray(resources)) {
      resources = [resources];
    }
    const urns = this.cfg.get('authorization:urns');
    if (subject && subject.scope && (action === AuthZAction.CREATE || action === AuthZAction.MODIFY)) {
      // add user and subject scope as default owner
      orgOwnerAttributes.push(
        {
          id: urns.ownerIndicatoryEntity,
          value: urns.organization
        },
        {
          id: urns.ownerInstance,
          value: subject.scope
        });
    }

    for (let resource of resources) {
      if (!resource.meta) {
        resource.meta = {};
      }
      if (action === AuthZAction.MODIFY || action === AuthZAction.DELETE) {
        const filters = [{
          filter: [{
            field: 'id',
            operation: FilterOperation.eq,
            value: resource.id
          }]
        }];
        let result = await super.read({
          request: { filters }
        });
        // update owner info
        if (result.items.length === 1) {
          let item = result.items[0].payload;
          resource.meta.owner = item.meta.owner;
        } else if (result.items.length === 0 && !resource.meta.owner) {
          let ownerAttributes = _.cloneDeep(orgOwnerAttributes);
          ownerAttributes.push(
            {
              id: urns.ownerIndicatoryEntity,
              value: urns.user
            },
            {
              id: urns.ownerInstance,
              value: subject.id
            });
          resource.meta.owner = ownerAttributes;
        }
      } else if (action === AuthZAction.CREATE && !resource.meta.owner) {
        let ownerAttributes = _.cloneDeep(orgOwnerAttributes);
        ownerAttributes.push(
          {
            id: urns.ownerIndicatoryEntity,
            value: urns.user
          },
          {
            id: urns.ownerInstance,
            value: subject.id
          });
        resource.meta.owner = ownerAttributes;
      }
    }
    return resources;
  }
}