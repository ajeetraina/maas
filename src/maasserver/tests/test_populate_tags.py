# Copyright 2012-2016 Canonical Ltd.  This software is licensed under the
# GNU Affero General Public License version 3 (see the file LICENSE).

"""Tests for `maasserver.populate_tags`."""

__all__ = []

from unittest.mock import (
    ANY,
    call,
    create_autospec,
)

from apiclient.creds import convert_tuple_to_string
from fixtures import FakeLogger
from maasserver import populate_tags as populate_tags_module
from maasserver.models import Tag
from maasserver.models.user import (
    create_auth_token,
    get_auth_tokens,
    get_creds_tuple,
)
from maasserver.populate_tags import (
    _do_populate_tags,
    populate_tags,
    populate_tags_for_single_node,
)
from maasserver.rpc.testing.fixtures import MockLiveRegionToClusterRPCFixture
from maasserver.testing.eventloop import (
    RegionEventLoopFixture,
    RunningEventLoopFixture,
)
from maasserver.testing.factory import factory
from maasserver.testing.testcase import MAASServerTestCase
from maastesting.matchers import (
    MockCalledOnceWith,
    MockCallsMatch,
)
from maastesting.twisted import (
    always_fail_with,
    always_succeed_with,
    extract_result,
)
from provisioningserver.refresh.node_info_scripts import (
    LLDP_OUTPUT_NAME,
    LSHW_OUTPUT_NAME,
)
from provisioningserver.rpc.cluster import EvaluateTag
from provisioningserver.rpc.common import Client
from provisioningserver.utils.twisted import asynchronous
from testtools.monkey import MonkeyPatcher


def make_Tag_without_populating():
    # Create a tag but prevent evaluation when saving.
    dont_populate = MonkeyPatcher((Tag, "populate_nodes", lambda self: None))
    return dont_populate.run_with_patches(factory.make_Tag)


class TestDoPopulateTags(MAASServerTestCase):

    def patch_clients(self, rack_controllers):
        clients = [
            create_autospec(Client, instance=True)
            for _ in rack_controllers
        ]
        for rack, client in zip(rack_controllers, clients):
            client.side_effect = always_succeed_with(None)
            client.ident = rack.system_id

        _get_clients = self.patch_autospec(
            populate_tags_module, "getAllClients")
        _get_clients.return_value = clients

        return clients

    def test__makes_calls_to_each_client_given(self):
        rack_controllers = [factory.make_RackController() for _ in range(3)]
        clients = self.patch_clients(rack_controllers)

        tag_name = factory.make_name("tag")
        tag_definition = factory.make_name("definition")
        tag_nsmap_prefix = factory.make_name("prefix")
        tag_nsmap_uri = factory.make_name("uri")
        tag_nsmap = [{"prefix": tag_nsmap_prefix, "uri": tag_nsmap_uri}]

        work = []
        rack_creds = []
        rack_nodes = []
        for rack, client in zip(rack_controllers, clients):
            creds = factory.make_name("creds")
            rack_creds.append(creds)
            nodes = [
                {"system_id": factory.make_Node().system_id}
                for _ in range(3)
            ]
            rack_nodes.append(nodes)
            work.append({
                "system_id": rack.system_id,
                "hostname": rack.hostname,
                "client": client,
                "tag_name": tag_name,
                "tag_definition": tag_definition,
                "tag_nsmap": tag_nsmap,
                "credentials": creds,
                "nodes": nodes,
            })

        [d] = _do_populate_tags(work)

        self.assertIsNone(extract_result(d))

        for rack, client, creds, nodes in zip(
                rack_controllers, clients, rack_creds, rack_nodes):
            self.expectThat(client, MockCallsMatch(call(
                EvaluateTag, tag_name=tag_name, tag_definition=tag_definition,
                system_id=rack.system_id,
                tag_nsmap=tag_nsmap, credentials=creds, nodes=nodes)))

    def test__logs_successes(self):
        rack_controllers = [factory.make_RackController()]
        clients = self.patch_clients(rack_controllers)

        tag_name = factory.make_name("tag")
        tag_definition = factory.make_name("definition")
        tag_nsmap = {}

        work = []
        for rack, client in zip(rack_controllers, clients):
            work.append({
                "system_id": rack.system_id,
                "hostname": rack.hostname,
                "client": client,
                "tag_name": tag_name,
                "tag_definition": tag_definition,
                "tag_nsmap": tag_nsmap,
                "credentials": factory.make_name("creds"),
                "nodes": [
                    {"system_id": factory.make_Node().system_id}
                    for _ in range(3)
                ],
            })

        with FakeLogger("maas") as log:
            [d] = _do_populate_tags(work)
            self.assertIsNone(extract_result(d))

        self.assertDocTestMatches(
            "Tag tag-... (definition-...) evaluated on rack "
            "controller ... (...)",
            log.output)

    def test__logs_failures(self):
        rack_controllers = [factory.make_RackController()]
        clients = self.patch_clients(rack_controllers)
        clients[0].side_effect = always_fail_with(
            ZeroDivisionError("splendid day for a spot of cricket"))

        tag_name = factory.make_name("tag")
        tag_definition = factory.make_name("definition")
        tag_nsmap = {}

        work = []
        for rack, client in zip(rack_controllers, clients):
            work.append({
                "system_id": rack.system_id,
                "hostname": rack.hostname,
                "client": client,
                "tag_name": tag_name,
                "tag_definition": tag_definition,
                "tag_nsmap": tag_nsmap,
                "credentials": factory.make_name("creds"),
                "nodes": [
                    {"system_id": factory.make_Node().system_id}
                    for _ in range(3)
                ],
            })

        with FakeLogger("maas") as log:
            [d] = _do_populate_tags(work)
            self.assertIsNone(extract_result(d))

        self.assertDocTestMatches(
            "Tag tag-... (definition-...) could not be evaluated ... (...): "
            "splendid day for a spot of cricket", log.output)


class TestPopulateTagsEndToNearlyEnd(MAASServerTestCase):

    def prepare_live_rpc(self):
        self.useFixture(RegionEventLoopFixture("rpc"))
        self.useFixture(RunningEventLoopFixture())
        return self.useFixture(MockLiveRegionToClusterRPCFixture())

    def test__calls_are_made_to_all_clusters(self):
        rpc_fixture = self.prepare_live_rpc()
        rack_controllers = [factory.make_RackController() for _ in range(3)]
        protocols = []
        rack_creds = []
        for rack in rack_controllers:
            tokens = list(get_auth_tokens(rack.owner))
            if len(tokens) > 0:
                # Use the latest token.
                token = tokens[-1]
            else:
                token = create_auth_token(rack.owner)
            creds = convert_tuple_to_string(get_creds_tuple(token))
            rack_creds.append(creds)

            protocol = rpc_fixture.makeCluster(rack, EvaluateTag)
            protocol.EvaluateTag.side_effect = always_succeed_with({})
            protocols.append(protocol)
        tag = make_Tag_without_populating()

        d = populate_tags(tag)

        # `d` is a testing-only convenience. We must wait for it to fire, and
        # we must do that from the reactor thread.
        wait_for_populate = asynchronous(lambda: d)
        wait_for_populate().wait(10)

        for rack, protocol, creds in zip(
                rack_controllers, protocols, rack_creds):
            self.expectThat(protocol.EvaluateTag, MockCalledOnceWith(
                protocol, tag_name=tag.name, tag_definition=tag.definition,
                system_id=rack.system_id,
                tag_nsmap=ANY, credentials=creds, nodes=ANY))


class TestPopulateTagsForSingleNode(MAASServerTestCase):

    def test_updates_node_with_all_applicable_tags(self):
        node = factory.make_Node()
        factory.make_NodeResult_for_commissioning(
            node, LSHW_OUTPUT_NAME, 0, b"<foo/>")
        factory.make_NodeResult_for_commissioning(
            node, LLDP_OUTPUT_NAME, 0, b"<bar/>")
        tags = [
            factory.make_Tag("foo", "/foo"),
            factory.make_Tag("bar", "//lldp:bar"),
            factory.make_Tag("baz", "/foo/bar"),
            ]
        populate_tags_for_single_node(tags, node)
        self.assertItemsEqual(
            ["foo", "bar"], [tag.name for tag in node.tags.all()])

    def test_ignores_tags_with_unrecognised_namespaces(self):
        node = factory.make_Node()
        factory.make_NodeResult_for_commissioning(
            node, LSHW_OUTPUT_NAME, 0, b"<foo/>")
        tags = [
            factory.make_Tag("foo", "/foo"),
            factory.make_Tag("lou", "//nge:bar"),
            ]
        populate_tags_for_single_node(tags, node)  # Look mom, no exception!
        self.assertSequenceEqual(
            ["foo"], [tag.name for tag in node.tags.all()])

    def test_ignores_tags_without_definition(self):
        node = factory.make_Node()
        factory.make_NodeResult_for_commissioning(
            node, LSHW_OUTPUT_NAME, 0, b"<foo/>")
        tags = [
            factory.make_Tag("foo", "/foo"),
            Tag(name="empty", definition=""),
            Tag(name="null", definition=None),
            ]
        populate_tags_for_single_node(tags, node)  # Look mom, no exception!
        self.assertSequenceEqual(
            ["foo"], [tag.name for tag in node.tags.all()])