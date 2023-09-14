# Signal Sighting

A framework for validating signals against alignments and rail furniture

## Functionality
Set Path : Pick a linear element and select Set Path.  The route will be set to the route of the path, note there is no current capabiltiy to reverse the route.
Set Target : Pick a 3D element and set target.  The range box centre will be defined as the target.  However, some elements cannot calculate a range and as such the target will not be set correctly.  Requires additionla investigation
Set X,Y,Z : Enter a X, Y, Z values and then set XYZ.  Will define the center of the target signal point.  This is a fail safe for when teh target cannot be set or for fine tuning the poisiton of the signal
X/Y/Z Offset : will set in m the distance from the linear element for the eye point.  If not target is set then the target point is always 10m in front of the eye point.  If a target point is set then the distance to the eye point to the target point is displayed.  Note if you pass the target point the camera will flip to always show the target   
Speed : the speed of the camera in mph, but will always be converted to meters / second
Zoom Distance : Can be used to fine tune the distance to zoom into.
Validate target : will draw a 150mm radius cylinder from the target to the eye point and run a clash check.  note that the potential canddidates will be set using a spatial query and for some datasets, the bounding box may not correctly identify the canddiates.  The candidate selection in these cases may need review
Take Snapshot : Will zoom by the preset amount and show all elements between the eye point and the target point.  The view will ensure all tiles are displayed and then save the snapshot as well as push a view state into the view history, so pressing back on the view history will redisplay the zoomed view.

## Alignments
An alignment can be loaded and assigned to an iModel.
The console will display the mode name if this is not defined
        case "KiwiRail-Johnsonville Track":          
          currentPathCoordinates = K1
          break;
If an alignment is not available then one can be built by selecting a linear element and dumping the "path" variable
Cell D2 : =MID(A2, FIND(":",A2)+1,100)
Cell E2 : ="{ cameraPoint : { x" & D2 & " y : " & D3 & " z : " & D4 & " },"
Cell F2 : =IF((ROW() - 2) /  3 = QUOTIENT(ROW() -2,3), E2, "")

Then cut and paste into a json file.

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

