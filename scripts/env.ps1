$env:npm_config_disturl="https://atom.io/download/electron"
$env:npm_config_target=(node "build/lib/electron.js")
$env:npm_config_runtime="electron"
Set-Content -Path "$env:USERPROFILE\.npmrc" -Value '//registry.npmjs.org/:_authToken=${NPM_TOKEN}' -Force
