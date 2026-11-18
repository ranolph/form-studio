"""Portable defaults and printer configuration for the public distribution."""
import argparse
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from urllib.request import ProxyHandler, build_opener

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import server


class PortableConfigTests(unittest.TestCase):
    def test_empty_library_default_and_no_personal_destination(self):
        with tempfile.TemporaryDirectory() as directory:
            config = server.Store(directory).config()
            self.assertEqual(config['layerLibraryUrl'], '')
            self.assertFalse(config['layerLibraryConfigured'])
            self.assertEqual(config['bedSize'], [256, 256, 256])

    def test_custom_build_volume_is_copied_and_retained(self):
        with tempfile.TemporaryDirectory() as directory:
            dimensions = [220, 180, 250]
            store = server.Store(directory, bed_size=dimensions)
            dimensions[0] = 1
            config = store.config()
            self.assertEqual(config['bedSize'], [220, 180, 250])
            config['bedSize'][0] = 1
            self.assertEqual(store.config()['bedSize'], [220, 180, 250])

    def test_saved_library_address_survives_default_changes(self):
        with tempfile.TemporaryDirectory() as directory:
            store = server.Store(directory, 'http://layer-library:8777')
            restarted = server.Store(directory, '')
            self.assertEqual(restarted.config()['layerLibraryUrl'], 'http://layer-library:8777')

    def test_invalid_build_volumes_are_rejected(self):
        for value in ('0,220,250', '-1,220,250', 'nan,220,250', 'inf,220,250', '220,220', '1,2,3,4', '2001,220,250', 'a,b,c', None):
            with self.subTest(value=value), self.assertRaises(argparse.ArgumentTypeError):
                server.parse_bed_size(value)
        self.assertEqual(server.parse_bed_size('220, 180.5,250'), [220, 180.5, 250])

    def test_process_environment_and_command_line_build_volume(self):
        http = build_opener(ProxyHandler({}))
        for arguments, expected in (([], [180, 200, 250]), (['--bed-size', '220,220,240'], [220, 220, 240])):
            with self.subTest(arguments=arguments), tempfile.TemporaryDirectory() as directory:
                with socket.socket() as sock:
                    sock.bind(('127.0.0.1', 0))
                    port = sock.getsockname()[1]
                env = dict(os.environ, FORM_STUDIO_BED_SIZE='180,200,250', LAYER_LIBRARY_URL='')
                process = subprocess.Popen([sys.executable, '-I', str(ROOT/'server.py'), '--host', '127.0.0.1', '--port', str(port), '--data', directory, *arguments], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
                try:
                    for _ in range(60):
                        try:
                            with http.open(f'http://127.0.0.1:{port}/api/config', timeout=1) as response:
                                config = json.load(response)
                            break
                        except OSError:
                            self.assertIsNone(process.poll(), process.stderr.read().decode() if process.poll() is not None else '')
                            time.sleep(.05)
                    else:
                        self.fail('Server did not start')
                    self.assertEqual(config['bedSize'], expected)
                    self.assertFalse(config['layerLibraryConfigured'])
                finally:
                    process.terminate()
                    process.wait(timeout=5)
                    process.stderr.close()


if __name__ == '__main__':
    unittest.main(verbosity=2)
