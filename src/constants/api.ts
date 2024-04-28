
let deploymentEnvDetector = () => {
    let appProduction = process.env.APP_PRODUCTION;
    console.log(`App Production: ${appProduction}`)
    let urlModifier
    if(appProduction === 'true'){
        return urlModifier = 's://'
    }
    else{
        return urlModifier = '://'
    }
}