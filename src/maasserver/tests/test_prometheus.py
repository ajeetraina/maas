# Copyright 2014-2018 Canonical Ltd.  This software is licensed under the
# GNU Affero General Public License version 3 (see the file LICENSE).

"""Test maasserver.prometheus."""

__all__ = []

import http.client
import json

from django.db import transaction
from maasserver import prometheus
from maasserver.models import Config
from maasserver.prometheus import (
    get_stats_for_prometheus,
    push_stats_to_prometheus,
)
from maasserver.testing.factory import factory
from maasserver.testing.testcase import (
    MAASServerTestCase,
    MAASTransactionServerTestCase,
)
from maasserver.utils.django_urls import reverse
from maastesting.matchers import (
    MockCalledOnce,
    MockCalledOnceWith,
    MockNotCalled,
)
from maastesting.testcase import MAASTestCase
from maastesting.twisted import extract_result
from provisioningserver.utils.twisted import asynchronous
from twisted.application.internet import TimerService
from twisted.internet.defer import fail


class TestPrometheusHandler(MAASServerTestCase):

    def test_prometheus_handler_returns_http_not_found(self):
        Config.objects.set_config('prometheus_enabled', False)
        response = self.client.get(reverse('metrics'))
        self.assertEqual("text/html; charset=utf-8", response["Content-Type"])
        self.assertEquals(response.status_code, http.client.NOT_FOUND)

    def test_prometheus_handler_returns_success(self):
        Config.objects.set_config('prometheus_enabled', True)
        self.patch(prometheus, "CollectorRegistry")
        self.patch(prometheus, "Gauge")
        self.patch(prometheus, "generate_latest").return_value = {}
        response = self.client.get(reverse('metrics'))
        self.assertEqual("text/plain", response["Content-Type"])
        self.assertEquals(response.status_code, http.client.OK)

    def test_prometheus_handler_returns_metrics(self):
        Config.objects.set_config('prometheus_enabled', True)
        metrics = (
            '# HELP machine_status Number per machines per stats'
            '# TYPE machine_status counter'
            'machine_status={status="deployed"} 100')
        self.patch(prometheus, "CollectorRegistry")
        self.patch(prometheus, "Gauge")
        self.patch(prometheus, "generate_latest").return_value = metrics
        response = self.client.get(reverse('metrics'))
        self.assertEqual(metrics, response.content.decode("unicode_escape"))


class TestPrometheus(MAASServerTestCase):

    def test_get_stats_for_prometheus(self):
        self.patch(prometheus, "CollectorRegistry")
        self.patch(prometheus, "Gauge")
        # general values
        values = {
            "machine_status": {
                "random_status": 0,
            },
            "controllers": {
                "regions": 0,
            },
            "nodes": {
                "machines": 0,
            },
            "network_stats": {
                "spaces": 0,
            },
            "machine_stats": {
                "total_cpus": 0,
            },
        }
        mock = self.patch(prometheus, "get_maas_stats")
        mock.return_value = json.dumps(values)
        # architecture
        arches = {
            "amd64": 0,
            "i386": 0,
        }
        mock_arches = self.patch(prometheus, "get_machines_by_architecture")
        mock_arches.return_value = arches
        # pods
        pods = {
            "kvm_pods": 0,
            "kvm_machines": 0,
        }
        mock_pods = self.patch(prometheus, "get_kvm_pods_stats")
        mock_pods.return_value = pods
        get_stats_for_prometheus()
        self.assertThat(
            mock, MockCalledOnce())
        self.assertThat(
            mock_arches, MockCalledOnce())
        self.assertThat(
            mock_pods, MockCalledOnce())

    def test_push_stats_to_prometheus(self):
        factory.make_RegionRackController()
        maas_name = 'random.maas'
        push_gateway = '127.0.0.1:2000'
        registry_mock = self.patch(prometheus, "CollectorRegistry")
        self.patch(prometheus, "Gauge")
        mock = self.patch(prometheus, "push_to_gateway")
        push_stats_to_prometheus(maas_name, push_gateway)
        self.assertThat(
            mock, MockCalledOnceWith(
                push_gateway,
                job="stats_for_%s" % maas_name,
                registry=registry_mock()))


class TestPrometheusService(MAASTestCase):
    """Tests for `ImportPrometheusService`."""

    def test__is_a_TimerService(self):
        service = prometheus.PrometheusService()
        self.assertIsInstance(service, TimerService)

    def test__runs_once_an_hour_by_default(self):
        service = prometheus.PrometheusService()
        self.assertEqual(3600, service.step)

    def test__calls__maybe_make_stats_request(self):
        service = prometheus.PrometheusService()
        self.assertEqual(
            (service.maybe_push_prometheus_stats, (), {}),
            service.call)

    def test_maybe_make_stats_request_does_not_error(self):
        service = prometheus.PrometheusService()
        deferToDatabase = self.patch(prometheus, "deferToDatabase")
        exception_type = factory.make_exception_type()
        deferToDatabase.return_value = fail(exception_type())
        d = service.maybe_push_prometheus_stats()
        self.assertIsNone(extract_result(d))


class TestPrometheusServiceAsync(MAASTransactionServerTestCase):
    """Tests for the async parts of `PrometheusService`."""

    def test_maybe_make_stats_request_makes_request(self):
        mock_call = self.patch(prometheus, "push_stats_to_prometheus")
        setting = self.patch(prometheus, "PROMETHEUS")
        setting.return_value = True

        with transaction.atomic():
            Config.objects.set_config('prometheus_enabled', True)
            Config.objects.set_config(
                'prometheus_push_gateway', '192.168.1.1:8081')

        service = prometheus.PrometheusService()
        maybe_push_prometheus_stats = asynchronous(
            service.maybe_push_prometheus_stats)
        maybe_push_prometheus_stats().wait(5)

        self.assertThat(mock_call, MockCalledOnce())

    def test_maybe_make_stats_request_doesnt_make_request(self):
        mock_call = self.patch(prometheus, "push_stats_to_prometheus")

        with transaction.atomic():
            Config.objects.set_config('enable_analytics', False)

        service = prometheus.PrometheusService()
        maybe_push_prometheus_stats = asynchronous(
            service.maybe_push_prometheus_stats)
        maybe_push_prometheus_stats().wait(5)

        self.assertThat(mock_call, MockNotCalled())
