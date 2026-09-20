# TerraWeave source import

This repository is being populated from the TerraWeave 0.1.0 delivery.

The one-time import workflow extracts the original application, ten standalone packages, documentation, examples, and tests into the repository root. It verifies the compressed payload's SHA-256 before extraction, then rebuilds the static distribution, npm archives, and binary terrain export fixtures using the delivered build scripts. Browser screenshots are recaptured from the running application.

The import payload is a temporary transport; the final repository contains ordinary, editable source files. Subsequent builds do not depend on the payload or on an external download service.

Source payload SHA-256: `13febf2770e480601d59951580ea4162b7a337bef62c734a7bb30fd9eb7775f6`.
