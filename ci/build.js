#!/usr/bin/env node

// Use Node 16 or above to run this script.
// `node build.js` will run this script.
//
// This script will call various NPM commands to build the application
// using the Docker images as per the settings below

// Overall
// Node 16 on CI server (GitHub Actions) calls this script
// This script calls NPM commands.
// NPM commands call shell scripts.

/*
Stuff like deploy should use dagger.io because it has specific dependencies like terraform
or we could have convetions in the npm scripts that they call dagger.io if needed but otherwise
they're just normal npm scripts.

In this way dagger becomes our way to compose and orchestrate our build and deploy scripts

actions:
    scripts for doing stuff.


*/

import { connect } from "@dagger.io/dagger"



// initialize Dagger client
console.log('starting...')
connect(async (client) => {
    // get reference to the local project
    const source = client.host().directory(".")

    // get Node image
    const node = client.container().from("node:12.11.0")

    // mount cloned repository into Node image
    const runner = client
        .container({ id: node })
        .withMountedDirectory("/src", source)
        .withWorkdir("/src")
        .withExec(["npm", "run", "hello"])
})