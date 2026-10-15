# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration handles:

- **Secrets.** The email and password of the Ariston NET account are stored by
  Gladys in the integration configuration (the password as a `secret` field,
  never shown again in the interface). The integration never logs them, nor the
  email address.
- **`/data`.** The only file written is `/data/ariston.json`, readable by the
  container user only: the Ariston NET session token (with a hash of the
  account it belongs to, not the email itself) and, per appliance, which
  sensors it reported. Deleting it is harmless: the integration logs in again.
- **Network.** Outgoing HTTPS only, to `www.ariston-net.remotethermo.com`. No
  port is opened, nothing is exposed on the local network.
- **Commands.** Setpoints and modes are checked against the appliance's own
  range and offered modes before being sent. These appliances have nothing
  that opens, unlocks or disarms.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
the Ariston NET service and the appliances, which belong to Ariston Group.
