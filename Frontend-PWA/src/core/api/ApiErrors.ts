// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/** Normalized failure raised by Layer 1 network transports. */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}
