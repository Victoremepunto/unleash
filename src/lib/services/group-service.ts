import {
    ICreateGroupModel,
    IGroup,
    IGroupModel,
    IGroupModelWithProjectRole,
    IGroupProject,
    IGroupRole,
    IGroupUser,
} from '../types/group';
import { IUnleashConfig, IUnleashStores } from '../types';
import { IGroupStore } from '../types/stores/group-store';
import { Logger } from '../logger';
import BadDataError from '../error/bad-data-error';
import { GROUP_CREATED, GROUP_DELETED, GROUP_UPDATED } from '../types/events';
import NameExistsError from '../error/name-exists-error';
import { IAccountStore } from '../types/stores/account-store';
import { IUser } from '../types/user';
import EventService from './event-service';

export class GroupService {
    private groupStore: IGroupStore;

    private eventService: EventService;

    private accountStore: IAccountStore;

    private logger: Logger;

    constructor(
        stores: Pick<IUnleashStores, 'groupStore' | 'accountStore'>,
        { getLogger }: Pick<IUnleashConfig, 'getLogger'>,
        eventService: EventService,
    ) {
        this.logger = getLogger('service/group-service.js');
        this.groupStore = stores.groupStore;
        this.eventService = eventService;
        this.accountStore = stores.accountStore;
    }

    async getAll(): Promise<IGroupModel[]> {
        const groups = await this.groupStore.getAll();
        const allGroupUsers = await this.groupStore.getAllUsersByGroups(
            groups.map((g) => g.id),
        );
        const users = await this.accountStore.getAllWithId(
            allGroupUsers.map((u) => u.userId),
        );
        const groupProjects = await this.groupStore.getGroupProjects(
            groups.map((g) => g.id),
        );

        return groups.map((group) => {
            const mappedGroup = this.mapGroupWithUsers(
                group,
                allGroupUsers,
                users,
            );
            return this.mapGroupWithProjects(groupProjects, mappedGroup);
        });
    }

    mapGroupWithProjects(
        groupProjects: IGroupProject[],
        group: IGroupModel,
    ): IGroupModel {
        return {
            ...group,
            projects: groupProjects
                .filter((project) => project.groupId === group.id)
                .map((project) => project.project),
        };
    }

    async getGroup(id: number): Promise<IGroupModel> {
        const group = await this.groupStore.get(id);
        const groupUsers = await this.groupStore.getAllUsersByGroups([id]);
        const users = await this.accountStore.getAllWithId(
            groupUsers.map((u) => u.userId),
        );
        return this.mapGroupWithUsers(group, groupUsers, users);
    }

    async createGroup(
        group: ICreateGroupModel,
        userName: string,
    ): Promise<IGroup> {
        await this.validateGroup(group);

        const newGroup = await this.groupStore.create(group);

        await this.groupStore.addUsersToGroup(
            newGroup.id,
            group.users,
            userName,
        );

        await this.eventService.storeEvent({
            type: GROUP_CREATED,
            createdBy: userName,
            data: group,
        });

        return newGroup;
    }

    async updateGroup(group: IGroupModel, userName: string): Promise<IGroup> {
        const preData = await this.groupStore.get(group.id);

        await this.validateGroup(group, preData);

        const newGroup = await this.groupStore.update(group);

        const existingUsers = await this.groupStore.getAllUsersByGroups([
            group.id,
        ]);
        const existingUserIds = existingUsers.map((g) => g.userId);

        const deletableUsers = existingUsers.filter(
            (existingUser) =>
                !group.users.some(
                    (groupUser) => groupUser.user.id === existingUser.userId,
                ),
        );

        await this.groupStore.updateGroupUsers(
            newGroup.id,
            group.users.filter(
                (user) => !existingUserIds.includes(user.user.id),
            ),
            deletableUsers,
            userName,
        );

        await this.eventService.storeEvent({
            type: GROUP_UPDATED,
            createdBy: userName,
            data: newGroup,
            preData,
        });

        return newGroup;
    }

    async getProjectGroups(
        projectId: string,
    ): Promise<IGroupModelWithProjectRole[]> {
        const projectGroups = await this.groupStore.getProjectGroups(projectId);

        if (projectGroups.length > 0) {
            const groups = await this.groupStore.getAllWithId(
                projectGroups.map((g) => g.id),
            );
            const groupUsers = await this.groupStore.getAllUsersByGroups(
                groups.map((g) => g.id),
            );
            const users = await this.accountStore.getAllWithId(
                groupUsers.map((u) => u.userId),
            );
            return groups.flatMap((group) => {
                return projectGroups
                    .filter((gr) => gr.id === group.id)
                    .map((groupRole) => ({
                        ...this.mapGroupWithUsers(group, groupUsers, users),
                        ...groupRole,
                    }));
            });
        }
        return [];
    }

    async deleteGroup(id: number, userName: string): Promise<void> {
        const group = await this.groupStore.get(id);

        await this.groupStore.delete(id);

        await this.eventService.storeEvent({
            type: GROUP_DELETED,
            createdBy: userName,
            preData: group,
        });
    }

    async validateGroup(
        group: IGroupModel | ICreateGroupModel,
        existingGroup?: IGroup,
    ): Promise<void> {
        if (!group.name) {
            throw new BadDataError('Group name cannot be empty');
        }

        if (!existingGroup || existingGroup.name !== group.name) {
            if (await this.groupStore.existsWithName(group.name)) {
                throw new NameExistsError('Group name already exists');
            }
        }
    }

    async getRolesForProject(projectId: string): Promise<IGroupRole[]> {
        return this.groupStore.getProjectGroupRoles(projectId);
    }

    private mapGroupWithUsers(
        group: IGroup,
        allGroupUsers: IGroupUser[],
        allUsers: IUser[],
    ): IGroupModel {
        const groupUsers = allGroupUsers.filter(
            (user) => user.groupId === group.id,
        );
        const groupUsersId = groupUsers.map((user) => user.userId);
        const selectedUsers = allUsers.filter((user) =>
            groupUsersId.includes(user.id),
        );
        const finalUsers = selectedUsers.map((user) => {
            const roleUser = groupUsers.find((gu) => gu.userId === user.id);
            return {
                user: user,
                joinedAt: roleUser?.joinedAt,
                createdBy: roleUser?.createdBy,
            };
        });
        return { ...group, users: finalUsers };
    }

    async syncExternalGroups(
        userId: number,
        externalGroups: string[],
        createdBy?: string,
    ): Promise<void> {
        if (Array.isArray(externalGroups)) {
            const newGroups = await this.groupStore.getNewGroupsForExternalUser(
                userId,
                externalGroups,
            );
            await this.groupStore.addUserToGroups(
                userId,
                newGroups.map((g) => g.id),
                createdBy,
            );
            const oldGroups = await this.groupStore.getOldGroupsForExternalUser(
                userId,
                externalGroups,
            );
            await this.groupStore.deleteUsersFromGroup(oldGroups);
        }
    }

    async getGroupsForUser(userId: number): Promise<IGroup[]> {
        return this.groupStore.getGroupsForUser(userId);
    }
}
