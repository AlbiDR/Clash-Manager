#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 AlbiDR

"""Compatibility entry point for the SQL-aware Node fold-state checker."""

import os
import subprocess
import sys


def main():
    script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fold-state.mjs")
    completed = subprocess.run(["node", script, *sys.argv[1:]], check=False)
    return completed.returncode


if __name__ == "__main__":
    sys.exit(main())
