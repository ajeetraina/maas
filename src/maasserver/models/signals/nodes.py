# Copyright 2015-2016 Canonical Ltd.  This software is licensed under the
# GNU Affero General Public License version 3 (see the file LICENSE).

"""Respond to node changes."""

__all__ = [
    "signals",
]

from django.db.models.signals import (
    post_init,
    post_save,
    pre_save,
)
from maasserver.enum import (
    NODE_STATUS,
    NODE_TYPE,
)
from maasserver.models import (
    ChassisHints,
    Controller,
    Device,
    Machine,
    Node,
    RackController,
    RegionController,
    Service,
)
from maasserver.utils.signals import SignalsManager
from metadataserver.models.nodekey import NodeKey


NODE_CLASSES = [
    Node,
    Machine,
    Device,
    Controller,
    RackController,
    RegionController,
]

signals = SignalsManager()


def post_init_store_previous_status(sender, instance, **kwargs):
    """Store the pre_save status of the instance."""
    instance.__previous_status = instance.status


for klass in NODE_CLASSES:
    signals.watch(
        post_init, post_init_store_previous_status, sender=klass)


def pre_save_update_status(sender, instance, **kwargs):
    """Update node previous_status when node status changes."""
    if (instance.__previous_status != instance.status and
            instance.__previous_status not in (
                NODE_STATUS.RESCUE_MODE,
                NODE_STATUS.ENTERING_RESCUE_MODE,
                NODE_STATUS.FAILED_ENTERING_RESCUE_MODE,
                NODE_STATUS.EXITING_RESCUE_MODE,
                NODE_STATUS.FAILED_EXITING_RESCUE_MODE)):
        instance.previous_status = instance.__previous_status


for klass in NODE_CLASSES:
    signals.watch(
        pre_save, pre_save_update_status, sender=klass)


def clear_nodekey_when_owner_changes(node, old_values, deleted=False):
    """Erase related `NodeKey` when node ownership changes."""
    assert not deleted, (
        "clear_nodekey_when_owner_changes is not prepared "
        "to deal with deletion of nodes.")

    owner_id_old = old_values[0]
    owner_id_new = node.owner_id

    if owner_id_new != owner_id_old:
        NodeKey.objects.clear_token_for_node(node)

for klass in NODE_CLASSES:
    signals.watch_fields(
        clear_nodekey_when_owner_changes,
        klass, ['owner_id'], delete=False)


def create_services_on_node_type_change(node, old_values, deleted=False):
    """Create services when node_type changes."""
    old_node_type = old_values[0]
    new_node_type = node.node_type
    if new_node_type != old_node_type:
        Service.objects.create_services_for(node)


def create_services_on_create(sender, instance, created, **kwargs):
    """Create services when node created."""
    if created:
        Service.objects.create_services_for(instance)

for klass in NODE_CLASSES:
    signals.watch_fields(
        create_services_on_node_type_change,
        klass, ['node_type'], delete=False)
    signals.watch(
        post_save, create_services_on_create,
        sender=klass)


def create_chassis_hints(sender, instance, created, **kwargs):
    """Create `ChassisHints` when `Chassis` is created."""
    try:
        chassis_hints = instance.chassis_hints
    except ChassisHints.DoesNotExist:
        chassis_hints = None
    if instance.node_type == NODE_TYPE.CHASSIS:
        if chassis_hints is None:
            ChassisHints.objects.create(chassis=instance)
    elif chassis_hints is not None:
        chassis_hints.delete()

for klass in NODE_CLASSES:
    signals.watch(
        post_save, create_chassis_hints,
        sender=klass)


# Enable all signals by default.
signals.enable()
