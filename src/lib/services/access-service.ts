import * as permissions from '../types/permissions';
import User, { IUser } from '../types/user';
import {
    IAccessInfo,
    IAccessStore,
    IGroupWithProjectRoles,
    IProjectRoleUsage,
    IRole,
    IRoleDescriptor,
    IRoleWithPermissions,
    IRoleWithProject,
    IUserPermission,
    IUserRole,
    IUserWithProjectRoles,
} from '../types/stores/access-store';
import { Logger } from '../logger';
import { IAccountStore, IGroupStore, IUnleashStores } from '../types/stores';
import {
    IAvailablePermissions,
    ICustomRole,
    IPermission,
    IRoleData,
    IUserWithRole,
    RoleName,
} from '../types/model';
import { IRoleStore } from 'lib/types/stores/role-store';
import NameExistsError from '../error/name-exists-error';
import { IEnvironmentStore } from 'lib/types/stores/environment-store';
import RoleInUseError from '../error/role-in-use-error';
import { roleSchema } from '../schema/role-schema';
import {
    ALL_ENVS,
    ALL_PROJECTS,
    CUSTOM_ROOT_ROLE_TYPE,
    CUSTOM_PROJECT_ROLE_TYPE,
    ROOT_ROLE_TYPES,
} from '../util/constants';
import { DEFAULT_PROJECT } from '../types/project';
import InvalidOperationError from '../error/invalid-operation-error';
import BadDataError from '../error/bad-data-error';
import { IGroup } from '../types/group';
import { GroupService } from './group-service';
import { IFlagResolver, IUnleashConfig, IUserAccessOverview } from 'lib/types';

const { ADMIN } = permissions;

const PROJECT_ADMIN = [
    permissions.UPDATE_PROJECT,
    permissions.DELETE_PROJECT,
    permissions.CREATE_FEATURE,
    permissions.UPDATE_FEATURE,
    permissions.DELETE_FEATURE,
];

/** @deprecated prefer to use NamePermissionRef */
export type IdPermissionRef = Pick<IPermission, 'id' | 'environment'>;
export type NamePermissionRef = Pick<IPermission, 'name' | 'environment'>;
export type PermissionRef = IdPermissionRef | NamePermissionRef;

interface IRoleCreation {
    name: string;
    description: string;
    type?: 'root-custom' | 'custom';
    permissions?: PermissionRef[];
}

export interface IRoleValidation {
    name: string;
    description?: string;
    permissions?: PermissionRef[];
}

export interface IRoleUpdate {
    id: number;
    name: string;
    description: string;
    type?: 'root-custom' | 'custom';
    permissions?: PermissionRef[];
}

export interface AccessWithRoles {
    roles: IRoleDescriptor[];
    groups: IGroupWithProjectRoles[];
    users: IUserWithProjectRoles[];
}

const isProjectPermission = (permission) => PROJECT_ADMIN.includes(permission);

export class AccessService {
    private store: IAccessStore;

    private accountStore: IAccountStore;

    private roleStore: IRoleStore;

    private groupService: GroupService;

    private groupStore: IGroupStore;

    private environmentStore: IEnvironmentStore;

    private logger: Logger;

    private flagResolver: IFlagResolver;

    constructor(
        {
            accessStore,
            accountStore,
            roleStore,
            environmentStore,
            groupStore,
        }: Pick<
            IUnleashStores,
            | 'accessStore'
            | 'accountStore'
            | 'roleStore'
            | 'environmentStore'
            | 'groupStore'
        >,
        {
            getLogger,
            flagResolver,
        }: Pick<IUnleashConfig, 'getLogger' | 'flagResolver'>,
        groupService: GroupService,
    ) {
        this.store = accessStore;
        this.accountStore = accountStore;
        this.roleStore = roleStore;
        this.groupService = groupService;
        this.environmentStore = environmentStore;
        this.logger = getLogger('/services/access-service.ts');
        this.flagResolver = flagResolver;
        this.groupStore = groupStore;
    }

    /**
     * Used to check if a user has access to the requested resource
     *
     * @param user
     * @param permission
     * @param projectId
     */
    async hasPermission(
        user: Pick<IUser, 'id' | 'permissions' | 'isAPI'>,
        permission: string | string[],
        projectId?: string,
        environment?: string,
    ): Promise<boolean> {
        const permissionsArray = Array.isArray(permission)
            ? permission
            : [permission];

        const permissionLogInfo =
            permissionsArray.length === 1
                ? `permission=${permissionsArray[0]}`
                : `permissions=[${permissionsArray.join(',')}]`;

        this.logger.info(
            `Checking ${permissionLogInfo}, userId=${user.id}, projectId=${projectId}, environment=${environment}`,
        );

        try {
            const userP = await this.getPermissionsForUser(user);
            return userP
                .filter(
                    (p) =>
                        !p.project ||
                        p.project === projectId ||
                        p.project === ALL_PROJECTS,
                )
                .filter(
                    (p) =>
                        !p.environment ||
                        p.environment === environment ||
                        p.environment === ALL_ENVS,
                )
                .some(
                    (p) =>
                        permissionsArray.includes(p.permission) ||
                        p.permission === ADMIN,
                );
        } catch (e) {
            this.logger.error(
                `Error checking ${permissionLogInfo}, userId=${user.id} projectId=${projectId}`,
                e,
            );
            return Promise.resolve(false);
        }
    }

    async getPermissionsForUser(
        user: Pick<IUser, 'id' | 'isAPI' | 'permissions'>,
    ): Promise<IUserPermission[]> {
        if (user.isAPI) {
            return user.permissions?.map((p) => ({
                permission: p,
            }));
        }
        return this.store.getPermissionsForUser(user.id);
    }

    async getPermissions(): Promise<IAvailablePermissions> {
        const bindablePermissions = await this.store.getAvailablePermissions();
        const environments = await this.environmentStore.getAll();

        const rootPermissions = bindablePermissions.filter(
            ({ type }) => type === 'root',
        );

        const projectPermissions = bindablePermissions.filter((x) => {
            return x.type === 'project';
        });

        const environmentPermissions = bindablePermissions.filter((perm) => {
            return perm.type === 'environment';
        });

        const allEnvironmentPermissions = environments.map((env) => {
            return {
                name: env.name,
                permissions: environmentPermissions.map((permission) => {
                    return { environment: env.name, ...permission };
                }),
            };
        });

        return {
            root: rootPermissions,
            project: projectPermissions,
            environments: allEnvironmentPermissions,
        };
    }

    async addUserToRole(
        userId: number,
        roleId: number,
        projectId: string,
    ): Promise<void> {
        return this.store.addUserToRole(userId, roleId, projectId);
    }

    async addGroupToRole(
        groupId: number,
        roleId: number,
        createdBy: string,
        projectId: string,
    ): Promise<void> {
        return this.store.addGroupToRole(groupId, roleId, createdBy, projectId);
    }

    async addRoleAccessToProject(
        users: IAccessInfo[],
        groups: IAccessInfo[],
        projectId: string,
        roleId: number,
        createdBy: string,
    ): Promise<void> {
        return this.store.addRoleAccessToProject(
            users,
            groups,
            projectId,
            roleId,
            createdBy,
        );
    }

    async addAccessToProject(
        roles: number[],
        groups: number[],
        users: number[],
        projectId: string,
        createdBy: string,
    ): Promise<void> {
        return this.store.addAccessToProject(
            roles,
            groups,
            users,
            projectId,
            createdBy,
        );
    }

    async setProjectRolesForUser(
        projectId: string,
        userId: number,
        roles: number[],
    ): Promise<void> {
        await this.store.setProjectRolesForUser(projectId, userId, roles);
    }

    async getProjectRolesForUser(
        projectId: string,
        userId: number,
    ): Promise<number[]> {
        return this.store.getProjectRolesForUser(projectId, userId);
    }

    async setProjectRolesForGroup(
        projectId: string,
        groupId: number,
        roles: number[],
        createdBy: string,
    ): Promise<void> {
        await this.store.setProjectRolesForGroup(
            projectId,
            groupId,
            roles,
            createdBy,
        );
    }

    async getProjectRolesForGroup(
        projectId: string,
        groupId: number,
    ): Promise<number[]> {
        return this.store.getProjectRolesForGroup(projectId, groupId);
    }

    async getRoleByName(roleName: string): Promise<IRole> {
        return this.roleStore.getRoleByName(roleName);
    }

    async removeUserAccess(projectId: string, userId: number): Promise<void> {
        await this.store.removeUserAccess(projectId, userId);
    }

    async removeGroupAccess(projectId: string, groupId: number): Promise<void> {
        await this.store.removeGroupAccess(projectId, groupId);
    }

    async setUserRootRole(
        userId: number,
        role: number | RoleName,
    ): Promise<void> {
        const newRootRole = await this.resolveRootRole(role);
        if (newRootRole) {
            try {
                await this.store.removeRolesOfTypeForUser(
                    userId,
                    ROOT_ROLE_TYPES,
                );

                await this.store.addUserToRole(
                    userId,
                    newRootRole.id,
                    DEFAULT_PROJECT,
                );
            } catch (error) {
                const message = `Could not add role=${newRootRole.name} to userId=${userId}`;
                this.logger.error(message, error);
                throw new Error(message);
            }
        } else {
            throw new BadDataError(`Could not find rootRole=${role}`);
        }
    }

    async getUserRootRoles(userId: number): Promise<IRoleWithProject[]> {
        const userRoles = await this.store.getRolesForUserId(userId);
        return userRoles.filter(({ type }) => ROOT_ROLE_TYPES.includes(type));
    }

    async removeUserFromRole(
        userId: number,
        roleId: number,
        projectId: string,
    ): Promise<void> {
        return this.store.removeUserFromRole(userId, roleId, projectId);
    }

    async removeGroupFromRole(
        groupId: number,
        roleId: number,
        projectId: string,
    ): Promise<void> {
        return this.store.removeGroupFromRole(groupId, roleId, projectId);
    }

    async updateUserProjectRole(
        userId: number,
        roleId: number,
        projectId: string,
    ): Promise<void> {
        return this.store.updateUserProjectRole(userId, roleId, projectId);
    }

    async updateGroupProjectRole(
        userId: number,
        roleId: number,
        projectId: string,
    ): Promise<void> {
        return this.store.updateGroupProjectRole(userId, roleId, projectId);
    }

    //This actually only exists for testing purposes
    async addPermissionToRole(
        roleId: number,
        permission: string,
        environment?: string,
    ): Promise<void> {
        if (isProjectPermission(permission) && !environment) {
            throw new Error(
                `ProjectId cannot be empty for permission=${permission}`,
            );
        }
        return this.store.addPermissionsToRole(
            roleId,
            [{ name: permission }],
            environment,
        );
    }

    //This actually only exists for testing purposes
    async removePermissionFromRole(
        roleId: number,
        permission: string,
        environment?: string,
    ): Promise<void> {
        if (isProjectPermission(permission) && !environment) {
            throw new Error(
                `ProjectId cannot be empty for permission=${permission}`,
            );
        }
        return this.store.removePermissionFromRole(
            roleId,
            permission,
            environment,
        );
    }

    async getRoles(): Promise<IRole[]> {
        return this.roleStore.getRoles();
    }

    async getRole(id: number): Promise<IRoleWithPermissions> {
        const role = await this.store.get(id);
        const rolePermissions = await this.store.getPermissionsForRole(role.id);
        return {
            ...role,
            permissions: rolePermissions,
        };
    }

    async getRoleData(roleId: number): Promise<IRoleData> {
        const [role, rolePerms, users] = await Promise.all([
            this.store.get(roleId),
            this.store.getPermissionsForRole(roleId),
            this.getUsersForRole(roleId),
        ]);
        return { role, permissions: rolePerms, users };
    }

    async getProjectRoles(): Promise<IRole[]> {
        return this.roleStore.getProjectRoles();
    }

    async getRolesForProject(projectId: string): Promise<IRole[]> {
        return this.roleStore.getRolesForProject(projectId);
    }

    async getRolesForUser(userId: number): Promise<IRole[]> {
        return this.store.getRolesForUserId(userId);
    }

    async wipeUserPermissions(userId: number): Promise<void[]> {
        return Promise.all([
            this.store.unlinkUserRoles(userId),
            this.store.unlinkUserGroups(userId),
            this.store.clearUserPersonalAccessTokens(userId),
            this.store.clearPublicSignupUserTokens(userId),
        ]);
    }

    async getUsersForRole(roleId: number): Promise<IUser[]> {
        const userIdList = await this.store.getUserIdsForRole(roleId);
        if (userIdList.length > 0) {
            return this.accountStore.getAllWithId(userIdList);
        }
        return [];
    }

    async getGroupsForRole(roleId: number): Promise<IGroup[]> {
        const groupdIdList = await this.store.getGroupIdsForRole(roleId);
        if (groupdIdList.length > 0) {
            return this.groupStore.getAllWithId(groupdIdList);
        }
        return [];
    }

    async getProjectUsersForRole(
        roleId: number,
        projectId?: string,
    ): Promise<IUserWithRole[]> {
        const userRoleList = await this.store.getProjectUsersForRole(
            roleId,
            projectId,
        );
        if (userRoleList.length > 0) {
            const userIdList = userRoleList.map((u) => u.userId);
            const users = await this.accountStore.getAllWithId(userIdList);
            return users.map((user) => {
                const role = userRoleList.find((r) => r.userId === user.id)!;
                return {
                    ...user,
                    addedAt: role.addedAt!,
                    roleId,
                };
            });
        }
        return [];
    }

    async getProjectUsers(projectId: string): Promise<IUserWithProjectRoles[]> {
        const projectUsers = await this.store.getProjectUsers(projectId);

        if (projectUsers.length > 0) {
            const users = await this.accountStore.getAllWithId(
                projectUsers.map((u) => u.id),
            );
            return users.flatMap((user) => {
                return projectUsers
                    .filter((u) => u.id === user.id)
                    .map((groupUser) => ({
                        ...user,
                        ...groupUser,
                    }));
            });
        }
        return [];
    }

    async getProjectRoleAccess(projectId: string): Promise<AccessWithRoles> {
        const roles = await this.roleStore.getProjectRoles();

        const users = await this.getProjectUsers(projectId);

        const groups = await this.groupService.getProjectGroups(projectId);

        return {
            roles,
            groups,
            users,
        };
    }

    async getProjectRoleUsage(roleId: number): Promise<IProjectRoleUsage[]> {
        return this.store.getProjectUserAndGroupCountsForRole(roleId);
    }

    async createDefaultProjectRoles(
        owner: IUser,
        projectId: string,
    ): Promise<void> {
        if (!projectId) {
            throw new Error('ProjectId cannot be empty');
        }

        const ownerRole = await this.roleStore.getRoleByName(RoleName.OWNER);

        // TODO: remove this when all users is guaranteed to have a unique id.
        if (owner.id) {
            this.logger.info(
                `Making ${owner.id} admin of ${projectId} via roleId=${ownerRole.id}`,
            );
            await this.store.addUserToRole(owner.id, ownerRole.id, projectId);
        }
    }

    async removeDefaultProjectRoles(
        owner: IUser,
        projectId: string,
    ): Promise<void> {
        this.logger.info(`Removing project roles for ${projectId}`);
        return this.roleStore.removeRolesForProject(projectId);
    }

    async getRootRoleForAllUsers(): Promise<IUserRole[]> {
        return this.roleStore.getRootRoleForAllUsers();
    }

    async getRootRoles(): Promise<IRole[]> {
        return this.roleStore.getRootRoles();
    }

    public async resolveRootRole(
        rootRole: number | RoleName,
    ): Promise<IRole | undefined> {
        const rootRoles = await this.getRootRoles();
        let role: IRole | undefined;
        if (typeof rootRole === 'number') {
            role = rootRoles.find((r) => r.id === rootRole);
        } else {
            role = rootRoles.find((r) => r.name === rootRole);
        }
        return role;
    }

    async getRootRole(roleName: RoleName): Promise<IRole | undefined> {
        const roles = await this.roleStore.getRootRoles();
        return roles.find((r) => r.name === roleName);
    }

    async getAllRoles(): Promise<ICustomRole[]> {
        return this.roleStore.getAll();
    }

    async createRole(role: IRoleCreation): Promise<ICustomRole> {
        // CUSTOM_PROJECT_ROLE_TYPE is assumed by default for backward compatibility
        const roleType =
            role.type === CUSTOM_ROOT_ROLE_TYPE
                ? CUSTOM_ROOT_ROLE_TYPE
                : CUSTOM_PROJECT_ROLE_TYPE;

        if (
            roleType === CUSTOM_ROOT_ROLE_TYPE &&
            this.flagResolver.isEnabled('customRootRolesKillSwitch')
        ) {
            throw new InvalidOperationError(
                'Custom root roles are not enabled.',
            );
        }

        const baseRole = {
            ...(await this.validateRole(role)),
            roleType,
        };

        const rolePermissions = role.permissions;
        const newRole = await this.roleStore.create(baseRole);
        if (rolePermissions) {
            if (roleType === CUSTOM_ROOT_ROLE_TYPE) {
                // this branch uses named permissions
                await this.store.addPermissionsToRole(
                    newRole.id,
                    rolePermissions,
                );
            } else {
                // this branch uses id permissions
                await this.store.addEnvironmentPermissionsToRole(
                    newRole.id,
                    rolePermissions,
                );
            }
        }
        return newRole;
    }

    async updateRole(role: IRoleUpdate): Promise<ICustomRole> {
        const roleType =
            role.type === CUSTOM_ROOT_ROLE_TYPE
                ? CUSTOM_ROOT_ROLE_TYPE
                : CUSTOM_PROJECT_ROLE_TYPE;

        if (
            roleType === CUSTOM_ROOT_ROLE_TYPE &&
            this.flagResolver.isEnabled('customRootRolesKillSwitch')
        ) {
            throw new InvalidOperationError(
                'Custom root roles are not enabled.',
            );
        }

        await this.validateRole(role, role.id);
        const baseRole = {
            id: role.id,
            name: role.name,
            description: role.description,
            roleType,
        };
        const rolePermissions = role.permissions;
        const newRole = await this.roleStore.update(baseRole);
        if (rolePermissions) {
            await this.store.wipePermissionsFromRole(newRole.id);
            if (roleType === CUSTOM_ROOT_ROLE_TYPE) {
                await this.store.addPermissionsToRole(
                    newRole.id,
                    rolePermissions,
                );
            } else {
                await this.store.addEnvironmentPermissionsToRole(
                    newRole.id,
                    rolePermissions,
                );
            }
        }
        return newRole;
    }

    async deleteRole(id: number): Promise<void> {
        await this.validateRoleIsNotBuiltIn(id);

        const roleUsers = await this.getUsersForRole(id);
        const roleGroups = await this.getGroupsForRole(id);

        if (roleUsers.length > 0 || roleGroups.length > 0) {
            throw new RoleInUseError(
                `Role is in use by users(${roleUsers.length}) or groups(${roleGroups.length}). You cannot delete a role that is in use without first removing the role from the users and groups.`,
            );
        }

        return this.roleStore.delete(id);
    }

    async validateRoleIsUnique(
        roleName: string,
        existingId?: number,
    ): Promise<void> {
        const exists = await this.roleStore.nameInUse(roleName, existingId);
        if (exists) {
            throw new NameExistsError(
                `There already exists a role with the name ${roleName}`,
            );
        }
        return Promise.resolve();
    }

    async validateRoleIsNotBuiltIn(roleId: number): Promise<void> {
        const role = await this.store.get(roleId);
        if (
            role.type !== CUSTOM_PROJECT_ROLE_TYPE &&
            role.type !== CUSTOM_ROOT_ROLE_TYPE
        ) {
            throw new InvalidOperationError(
                'You cannot change built in roles.',
            );
        }
    }

    async validateRole(
        role: IRoleValidation,
        existingId?: number,
    ): Promise<IRoleCreation> {
        const cleanedRole = await roleSchema.validateAsync(role);
        if (existingId) {
            await this.validateRoleIsNotBuiltIn(existingId);
        }
        await this.validateRoleIsUnique(role.name, existingId);
        return cleanedRole;
    }

    async getUserAccessOverview(): Promise<IUserAccessOverview[]> {
        return this.store.getUserAccessOverview();
    }
}
