#!/usr/bin/env python2.7
# Copyright 2014 Canonical Ltd.  This software is licensed under the
# GNU Affero General Public License version 3 (see the file LICENSE).

"""Configure a node's network interfaces.

This script is meant to be run on a MAAS node.

At the moment, it does only one job: it writes `/etc/network/` configuration
to set static IPv6 addresses for network interfaces.
"""

from __future__ import (
    absolute_import,
    print_function,
    unicode_literals,
    )

str = None

__metaclass__ = type

from argparse import ArgumentParser
from errno import ENOENT
from os import (
    listdir,
    rename,
    )
import os.path
from random import randint
from subprocess import check_call


class BadArgument(Exception):
    """Incorrect or malformed argument."""


def normalise_mac(mac):
    """Normalise the "spelling" of a MAC address."""
    return mac.lower().strip()


def split_ip_mac_pair(argument_string):
    """Turn an `IP=MAC` string into a tuple `(IP, MAC)`."""
    parts = argument_string.split('=', 1)
    if len(parts) != 2:
        raise BadArgument("Not a valid IP=MAC pair: '%s'." % argument_string)
    [ip, mac] = parts
    return ip, normalise_mac(mac)


def prepare_parser():
    """Set up an arguments parser with this script's options."""
    parser = ArgumentParser(description=__doc__)
    parser.add_argument(
        '--static-ip', '-s', type=split_ip_mac_pair, action='append',
        default=[],
        help=(
            "Set a given static IP address on the network interface that has "
            "a given MAC address.  Pass an IP=MAC address pair, separated by "
            "an equals sign.  This option may be used multiple times."))
    parser.add_argument(
        '--config-dir', '-d', default='/etc/network',
        help=(
            "Location where this script can write configuration snippets "
            "for network interfaces."))
    parser.add_argument(
        '--update-interfaces', '-u', action='store_true',
        help="Update /etc/network/interfaces to use the generated config.")
    parser.add_argument(
        '--restart-interfaces', '-r', action='store_true',
        help="Restart network interfaces after configuring.")
    return parser


def read_file(path):
    """Return the contents of the file at `path`."""
    with open(path, 'rb') as infile:
        return infile.read()


def map_interfaces_by_mac():
    """Map network interfaces' MAC addresses to interface names.

    The input to this function is the system's current networking
    configuration.  It does not attempt to parse configuration files.

    :return: A dict mapping each normalised MAC address to a list of network
        interfaces that have that MAC address.
    """
    # Query network interfaces based on /sys/class/net/.  This script runs in a
    # very limited environment, so pulling in external dependencies like the
    # netifaces package is undesirable.
    interfaces = listdir('/sys/class/net')
    macs_to_interfaces = {}
    for interface in interfaces:
        try:
            mac = read_file(
                os.path.join('/sys/class/net', interface, 'address'))
        except IOError as e:
            # Tolerate file-not-found errors, to absorb any variability in
            # the /sys/class/net API that doesn't concern us.
            if e.errno != ENOENT:
                raise
        else:
            mac = normalise_mac(mac)
            macs_to_interfaces.setdefault(mac, [])
            macs_to_interfaces[mac].append(interface)

    return macs_to_interfaces


def map_addresses_by_interface(interfaces_by_mac, ip_mac_pairs):
    """Map network interfaces to the static addresses they should receive.

    :param interfaces_by_mac: A dict as produced by `map_interfaces_by_mac`.
    :param ip_mac_pairs: An iterable of IP/MAC address pairs, as tuples.
        The MAC addresses must be normalised.
    :return: A dict mapping interface names to their static IP addresses.
    """
    mapping = {}
    for ip, mac in ip_mac_pairs:
        interfaces = interfaces_by_mac.get(mac, [])
        for interface in interfaces:
            mapping.setdefault(interface, [])
            mapping[interface].append(ip)
    return mapping


def compose_config_stanza(interface, ips):
    """Return a configuration stanza for a given network interface.

    :param interface: Network interface name.
    :param ips: A list of IPv6 addresses.
    :return: Text of an `/etc/network/interfaces.d` configuration stanza.
    """
    return '\n'.join(
        ["iface %s inet6 static" % interface] +
        ["\tnetmask 64"] +
        ["\taddress %s" % ip for ip in ips])


def compose_config_file(interfaces_by_mac, addresses_by_interface):
    """Return a network interfaces configuration file.

    :param interfaces_by_mac: Dict mapping MAC addresses to lists of
        interfaces that have those addresses.
    :param addresses_by_interface: Dict mapping MAC addresses to lists of
        static IP addresses that should be assigned to the interfaces
        associated with those MACs.
    :return: Text of an `/etc/network/interfaces.d` snippet.
    """
    stanzas = '\n\n'.join(
        compose_config_stanza(interface, ips)
        for interface, ips in addresses_by_interface.items())
    return (
        "# MAAS-generated static interface configurations.\n\n%s\n"
        % stanzas)


# Name of the MAAS-generated network interfaces config file.
MAAS_INTERFACES_CONFIG = 'maas-config'


def locate_maas_config(config_dir):
    """Return the location of the MAAS interfaces config file."""
    return os.path.join(config_dir, 'interfaces.d', MAAS_INTERFACES_CONFIG)


def write_file(path, text, encoding='utf-8'):
    """Atomically write `text` to file at `path`."""
    content = text.encode(encoding)
    temp_file = path + '.new-%d' % randint(10000, 99999)
    with open(temp_file, 'wb') as outfile:
        outfile.write(content)
    rename(temp_file, path)


def configure_static_addresses(config_dir, ip_mac_pairs):
    """Write interfaces config file for static addresses.

    :param config_dir: Location of interfaces config directory.
    :return: A list of interface names that have received addresses.
    """
    interfaces_by_mac = map_interfaces_by_mac()
    addresses_by_interface = map_addresses_by_interface(
        interfaces_by_mac, ip_mac_pairs)
    interfaces_file = locate_maas_config(config_dir)
    config = compose_config_file(
        addresses_by_interface, addresses_by_interface)
    write_file(interfaces_file, config)
    return sorted(addresses_by_interface.keys())


def update_interfaces_file(config_dir):
    """Update `/etc/network/interfaces` to include our generated config.

    This is likely to fail when not running as root.

    If the file already mentions the MAAS config file, this function assumes
    that it was updated with the MAAS config in mind, and won't touch it.

    :param config_dir: Location for `/etc/network`.  The MAAS config will have
        been written to its `interfaces.d`; the `interfaces` config file in the
        same directory will be rewritten.
    """
    interfaces_file = os.path.join(config_dir, 'interfaces')
    with open(interfaces_file, 'rb') as infile:
        interfaces_config = infile.read().decode('utf-8')
    if MAAS_INTERFACES_CONFIG not in interfaces_config:
        new_config = "%s\n\nsource interfaces.d/%s\n" % (
            interfaces_config,
            MAAS_INTERFACES_CONFIG,
            )
        write_file(interfaces_file, new_config)


def restart_interfaces(interfaces):
    """Restart each of the given network interfaces.

    Call this after updating the systems network configuration if you want the
    new configuration to take effect right away.
    """
    for interface in interfaces:
        check_call(['ifdown', interface])
        check_call(['ifup', interface])


if __name__ == "__main__":
    args = prepare_parser().parse_args()
    interfaces = configure_static_addresses(args.config_dir, args.static_ip)
    if args.update_interfaces:
        update_interfaces_file(args.config_dir)
    if args.restart_interfaces:
        restart_interfaces(interfaces)
