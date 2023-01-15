#!/usr/bin/env node

const fs = require('fs')
const packageJson = require('../package.json')
const shell = require('shelljs');
const { zip } = require('zip-a-folder');
/**
Creates a deployment package.json file based of an existing package.json file
The way AWS beanstalk node.js deployments work, is that they use the package.json
to run `npm install` and then `npm start` to start the application.

Doing it the AWS documented way with the original package.json, you'd basically download
ALL of the dependencies (prod and dev), build the application (e.g. transpiling etc) and
then start it. This can be quite slow and redundant if you've already built the application
in your CI/CD. It works great for code that doesn't require transpiling, but for code that
does, it's a bit of a waste.

So, instead, we create a deployment package.json that depends on the original package.
When AWS does it's thing, all it's downloading is the original package and it's dependencies
and then starting the application. This is much faster and more efficient. In our experience
this is much faster than both the AWS documented way and docker deployments. YMMV.

TODO: Apparently if you include a node_modules folder in the deployment, AWS will use that
instead of doing an npm install. This could be even faster, but we haven't tried it yet.
See https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/nodejs-platform-dependencies.html#nodejs-platform-nodemodules
**/
function createPackageJson(context, filepath) {
    const { name, version, description, author, contributors, engines, keywords, license, private: privateKey, repository, bugs, homepage } = context;
    const newPackageJson = {
        "name": `${name}-deployment`,
        version,
        description,
        author,
        contributors,
        engines,
        keywords,
        license,
        private: privateKey,
        repository,
        bugs,
        homepage,
        "scripts": {
            // TODO: see if we can use the context.main as the start script
            "start": "addressr-server-2"
        },
        "dependencies": {
            [name]: version
        },
    }
    fs.writeFileSync(filepath, JSON.stringify(newPackageJson, null, 2))
}

async function createDeploymentArchive(deploymentDir) {
    shell.mkdir('-p', deploymentDir)
    createPackageJson(packageJson, `${deploymentDir}/package.json`)
    const archiveName = packageJson.name.replace('@', '').replace('/', '-')
    await zip(`${deploymentDir}/`, `${archiveName}-deployment-${packageJson.version}.zip`)
}

createDeploymentArchive('./deployment')