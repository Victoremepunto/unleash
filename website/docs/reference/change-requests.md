---
title: Change Requests
---

import VideoContent from '@site/src/components/VideoContent.jsx';

:::info Availability

The change requests feature is an enterprise-only feature that was introduced in **Unleash 4.19.0**.
The change requests for segments was introduced in **Unleash 5.4.0**.

:::


<VideoContent videoUrls={["https://www.youtube.com/embed/ENUqFVcdr-w"]}/>


Feature flagging is a powerful tool, and because it's so powerful, you sometimes need to practice caution. The ability to have complete control over your production environment comes at the cost of the potential to make mistakes in production. Change requests were introduced in version 4.19.0 to alleviate this fear. Change requests allow you to group changes together and apply them to production at the same time, instead of applying changes directly to production. This allows you to make multiple changes to feature toggles and their configuration and status (on/off) all at once, reducing the risk of errors in production.

Our goal is developer efficiency, but we also recognize that we have users and customers in highly regulated industries, governed by law and strict requirements. Therefore, we have added a capability to change requests that will allow you to enforce the _4 eyes principle_.

## Change request configuration

The change request configuration can be set up per project, per environment. This means that you can have different change request configurations for different environments, such as production and development. This is useful because different environments may have different requirements, so you can customize the change request configuration to fit those requirements. However, this also means that you cannot change toggles across projects in the same change request.

Currently there are two configuration options for change requests:
* **Enable change requests** - This is a boolean value that enables or disables change requests for the project and environment.
* **Required approvals** - This is an integer value that indicates how many approvals are required before a change request can be applied. Specific permissions are required to approve and apply change requests.

The change request configuration can be set up in the project settings page:

![Change request configuration](/img/change-request-configuration.png)


## Change request flow

Once a change request flow is configured for a project and environment, you can no longer directly change the status of a toggle. Instead, you will be asked to put your changes into a draft. The change request flow handles the following scenarios:

* Updating the status of a toggle in the environment
* Adding a strategy to the feature toggle in the environment
* Updating a strategy of a feature toggle in the environment
* Deleting a strategy from a feature toggle in the environment

The flow can be summarized as follows:

![Change request flow](/img/change-request-flow.png)

Once a change is added to a draft, the draft needs to be completed before another change request can be opened. The draft is personal to the user that created the change request draft, until it is sent for review. Once changes are added to draft, the user will have a banner in the top of the screen indicating that a draft exists. The state of a change request can be one of the following:

* **Draft** - The change request is in draft mode, and can be edited by the user that created the draft.
* **In review** - The change request is in review mode, and can be edited by the user that created the draft. If editing occurs, all current approvals are revoked
* **Approved** - The change request has been approved by the required number of users.
* **Applied** - The change request has been applied to the environment. The feature toggle configuration is updated.
* **Cancelled** - The change request has been cancelled by the change request author or by an admin.
* **Rejected** - The change request has been rejected by the reviewer or by an admin.

![Change request banner](/img/change-request-banner.png)

Once a change request is sent to review by the user who created it, it becomes available for everyone in the change request tab in the project.

From here, you can navigate to the change request overview page. This page will give you information about the changes the change request contains, the state the change request is in, and what action needs to be taken next.

![Change request banner](/img/change-request-overview.png)

From here, if you have the correct permissions, you can approve and apply the change request. Once applied the changes will be live in production.

## Change request permissions

Change requests have their own set of environment-specific permissions that can be applied to [custom project roles](rbac.md#custom-project-roles). These permissions let users

- approve/reject change requests
- apply change requests
- skip the change request flow

None of the predefined roles have any change request permissions, so you must create your own project roles to take advantage of change requests. In other words, even a user with the project "owner" role can not approve or apply change requests.

There is no permission to create change requests: **Anyone can create change requests**, even Unleash users with the [root viewer role](rbac.md#predefined-roles). Change requests don't cause any changes until approved and applied by someone with the correct permissions.

You can prevent non-project members from submitting change requests by setting a [protected project collaboration mode](project-collaboration-mode.md).

### Circumventing change requests

The **skip change requests** permission allows users to bypass the change request flow. Users with this permission can change feature toggles directly (they are of course still limited by any other permissions they have).

The skip change requests permission was designed to make it possible to quickly turn something off in the event that a feature release didn't go as expected or was causing issues.

The skip change requests permission does **not** grant any other permissions, so to be allowed to do things as enabling/disabling a toggle, the user will still need the explicit permissions to do that too.

In the UI non-admin users with **skip change requests** permission and explicit permission to perform the actual action will be able to make changes directly without change requests.

Admin users will always see the change request UI so that they can test the change request flow. Admin users can however self-approve and self-apply their own changes.

## Change Request for segments

Changes to project [segments](segments.mdx) (as opposed to global segments) also go through the change request process. This is to prevent a backdoor in the change request process.

Since projects segments are not environment specific and change requests are always environment specific we allow to attach segment change to any environment with change requests enabled.
When you make changes though the Change Request UI it will automatically select first environment with change requests enabled, giving priority to [production](environments.md#environment-types) environments.

Changes to segments can be only circumvented by admin users through the API calls.
