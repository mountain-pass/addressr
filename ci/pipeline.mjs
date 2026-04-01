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
import envPaths from "env-paths"
import fs from "fs"

const cacheDir = `${envPaths("", { suffix: "" }).cache}/dagger`

const binLocation = `${cacheDir}/dagger-0.3.9`

if (!process.env._EXPERIMENTAL_DAGGER_CLI_BIN && fs.existsSync(binLocation)) {
    process.env._EXPERIMENTAL_DAGGER_CLI_BIN = binLocation
    console.log(`using already downloaded '${binLocation}'`)
}

console.log('connecting...')
connect(async (client) => {
    console.log('\t...connected')
    // get reference to the local project
    client.log
    const workspace = client.host().directory(".")//, { exclude: ["node_modules/"] })

    // get Node image
    const node = client.container().from("node:14.21.2")
        .withMountedDirectory("/workspace", workspace)
        .withWorkdir("/workspace");

    console.log(await node.withExec(["npm", "--version"]).stdout())

    const installed = node
    //     .withExec(["npm", "install"])

    // const exitCode = await installed.exitCode()
    // console.log({ exitCode });
    // const stdout = await installed.stdout()
    // const stderr = await installed.stderr()
    // const version = await node.withExec(["node", "-v"]).stdout()

    // print output
    // console.log("Hello from Dagger and Node " + version)

    await installed.withExec(["npm", "run", "genversion"]).file('version.js').export('dagger-version.js')


    console.log(stdout)
    console.error(stderr)

    /*
    npm run genversion
                npm run check-licenses
                npm run cover:nodejs:nogeo
                npm run cover:rest:nogeo
    */

    installed.withExec(["npm", "run", "build"])
    // await runner.exitCode()
    // .directory("node_modules/")
    // .export("./dagger_node_modules")

})