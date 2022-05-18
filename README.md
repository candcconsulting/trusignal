# Model Checker

A framework for validating the contents of an iModel

## Valid Checks
BS1192 : Check BS1192 naming convention for categories / layers and levels
HS2 : Check HS2 naming convention for categories / layers and levels
Uniclass : Check Uniclass naming convention for categories / layers and levels
Property : Property Content Check
Spaces : Check the content of each space
Equipment

Each rule is meant to have a definition and logic.  The json file should not require changes to the script in order to function, but is designed to be extensible

## Environment Variables

Prior to running the app, you will need to add OIDC client configuration to the variables in the .env file:

```
# ---- Authorization Client Settings ----
IMJS_AUTH_CLIENT_CLIENT_ID=""
IMJS_AUTH_CLIENT_REDIRECT_URI=""
IMJS_AUTH_CLIENT_LOGOUT_URI=""
IMJS_AUTH_CLIENT_SCOPES =""
```
You should also add a valid iTwinId and iModelId for your user in the this file:

```
# ---- Test ids ----
IMJS_ITWIN_ID = ""
IMJS_IMODEL_ID = ""
```

