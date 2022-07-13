/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import "./App.scss";

import { BrowserAuthorizationClient } from "@itwin/browser-authorization";
import { IModelConnection,  ViewState } from "@itwin/core-frontend";
import { IModelApp, } from "@itwin/core-frontend";
import { FillCentered } from "@itwin/core-react";
import { Header, HeaderLogo, IconButton, ProgressLinear, UserIcon } from "@itwin/itwinui-react";
import { SvgSettings } from "@itwin/itwinui-icons-react";

import {
  useAccessToken,
  Viewer,
} from "@itwin/web-viewer-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";

import { history } from "./history";
import { ThemeButton } from "./helper/ThemeButton";
import { CameraPathWidgetProvider } from "./components/widgets/cameraPathWidget";
import { initialiseapitokens, mapLayerOptions, tileAdminOptions } from "./api/maptokens";
import { IModelViewportControlOptions } from "@itwin/appui-react";
import { Id64 } from "@itwin/core-bentley";

/*
const windowElement = document.createElement("div");
  windowElement.id = "portal";
  windowElement.style.width = "600px";
  windowElement.style.height = "400px";
*/

const App: React.FC = () => {
  const [iModelId, setIModelId] = useState(process.env.IMJS_IMODEL_ID);
  const [iModelName, setiModelName] = useState("...")
  const [iTwinId, setITwinId] = useState(process.env.IMJS_ITWIN_ID);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const accessToken = useAccessToken();
  const [viewportOptions, setViewportOptions] = useState<IModelViewportControlOptions>();
  const [viewState, setViewEffect] = useState<ViewState | undefined>();



  const authClient = useMemo(
    () =>
      new BrowserAuthorizationClient({
        scope: process.env.IMJS_AUTH_CLIENT_SCOPES ?? "",
        clientId: process.env.IMJS_AUTH_CLIENT_CLIENT_ID ?? "",
        // redirectUri: process.env.IMJS_AUTH_CLIENT_REDIRECT_URI ?? window.location.origin + "/signin-callback",
        redirectUri: window.location.origin + "/signin-callback",
        postSignoutRedirectUri: process.env.IMJS_AUTH_CLIENT_LOGOUT_URI,
        responseType: "code",
        authority: process.env.IMJS_AUTH_AUTHORITY,
      }),
    []
  );

  
  const [isAuthorized, setIsAuthorized] = useState(
    accessToken
      ? true
      : false
  );


  const login = useCallback(async () => {
    try {
      await authClient.signInSilent();
    } catch {
      await authClient.signIn();
    }
  }, [authClient]);

  const onLoginClick = async () => {
    setIsLoggingIn(true);
    await authClient.signIn();
  };

  const onLogoutClick = async () => {
    setIsLoggingIn(false);
    await authClient.signOut();
    setIsAuthorized(false);
  };

  /*useEffect(() => {
    console.debug("Mount");
    const popup = window.open("","Viewport", "resizable,width=600,height=400,left=200,top=200");
    if (popup) {
      popup.document.body.appendChild(windowElement);
      setPopup(true);
      return () => {
        popup.document.removeChild(windowElement);
        popup.close();
      };
    } else {
      alert("Window is NULL. Please allow popup on this page.");
    }
    return () => {};
  }, []);
*/


  useEffect(() => {
    void login();
  }, [login]);

  useEffect(() => {
    if (!iModelId) {    
      const urlParams = new URLSearchParams(window.location.search);
      const urliModelId = urlParams.get("iModelId") as string;
      if (urliModelId)
        setIModelId(urliModelId)
      else
        setIModelId(process.env.IMJS_IMODEL_ID)
    }
  } , [iModelId])

  useEffect(() => {
    if (accessToken) {
      setIsAuthorized(true)
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has("iTwinId")) {
        // setITwinId(urlParams.get("iTwinId") as string);
      } else {
        if (!process.env.IMJS_ITWIN_ID) {
          throw new Error(
            "Please add a valid iTwin ID in the .env file and restart the application or add it to the iTwinId query parameter in the url and refresh the page. See the README for more information."
          );
        }
      }
      initialiseapitokens();
      if (iModelId) {        
        setIModelId(urlParams.get("iModelId") as string); 
      }        
      else {
        if (!process.env.IMJS_IMODEL_ID) {
          throw new Error(
            "Please add a valid iModel ID in the .env file and restart the application or add it to the iModelId query parameter in the url and refresh the page. See the README for more information."
          );
        }
      }
    }
  }, [accessToken, authClient, iModelId]);

  useEffect(() => {
    if (accessToken && iTwinId && iModelId) {
      history.push(`?iTwinId=${iTwinId}&iModelId=${iModelId}`);
    }
  }, [accessToken, iTwinId, iModelId, authClient]);
  
useEffect(() => {
  if (isOpen) {
    IModelApp.quantityFormatter.setActiveUnitSystem("metric", true);
  }
}, [isOpen])




const iModelConnected = useCallback ((iModel: IModelConnection) => {
    IModelApp.quantityFormatter.setActiveUnitSystem("metric", true);
    setIsOpen(true);
    setiModelName(iModel.name)
  }, [])

  const _oniModelReady = async (iModelConnection: IModelConnection) => {
    console.debug("iModelReady");
    const defaultViewId = await iModelConnection?.views?.queryDefaultViewId();
    if (defaultViewId && Id64.isValidId64(defaultViewId)) {
      await setViewEffect(await iModelConnection?.views.load(defaultViewId))      
      setViewportOptions({ viewState });
    };  
  };


  /** NOTE: This function will execute the "Fit View" tool after the iModel is loaded into the Viewer.
   * This will provide an "optimal" view of the model. However, it will override any default views that are
   * stored in the iModel. Delete this function and the prop that it is passed to if you prefer
   * to honor default views when they are present instead (the Viewer will still apply a similar function to iModels that do not have a default view).
   */

  /*
  const viewConfiguration = useCallback((viewPort: ScreenViewport) => {
    // default execute the fitview tool and use the iso standard view after tile trees are loaded
    const tileTreesLoaded = () => {
      return new Promise((resolve, reject) => {
        const start = new Date();
        const intvl = setInterval(() => {
          if (viewPort.areAllTileTreesLoaded) {
            ViewerPerformance.addMark("TilesLoaded");
            void ViewerPerformance.addAndLogMeasure(
              "TileTreesLoaded",
              "ViewerStarting",
              "TilesLoaded",
              viewPort.numReadyTiles
            );
            clearInterval(intvl);
            resolve(true);
          }
          const now = new Date();
          // after 20 seconds, stop waiting and fit the view
          if (now.getTime() - start.getTime() > 20000) {
            reject();
          }
        }, 100);
      });
    };

    tileTreesLoaded().finally(() => {
      void IModelApp.tools.run(FitViewTool.toolId, viewPort, true, false);
      viewPort.view.setStandardRotation(StandardViewId.Iso);
    });
  }, []);

  const viewCreatorOptions = useMemo(
    () => ({ viewportConfigurer: viewConfiguration }),
    [viewConfiguration]
  );
*/

  return (
    <div className="app">
    <Header
    appLogo={<HeaderLogo logo={<SvgSettings />}>{`Signal Verifier ${iModelName}`}</HeaderLogo>}
     actions={[<ThemeButton key="themeSwitched" />]}
     userIcon={
       <IconButton styleType="borderless"  onClick={() => {authClient.isAuthorized ? onLogoutClick() : onLoginClick()} }>
         <UserIcon
         className={authClient.isAuthorized===true ? "App-logo-noSpin" : "App-logo"} 
           size="medium"
           status={authClient.isAuthorized ? "online" : "offline"} 
           image={
             <img
               src="https://itwinplatformcdn.azureedge.net/iTwinUI/user-placeholder.png"
               alt="User icon"
             />
           }
         />
       </IconButton>
     }
   />
  <div className="viewer-container">
      {!accessToken && (
        <FillCentered>
          <div className="signin-content">
            <ProgressLinear indeterminate={true} labels={["Signing in..."]} />
          </div>
        </FillCentered>
      )}
      <Viewer
        iTwinId={iTwinId}
        iModelId={iModelId}
        authClient={authClient}
        //viewCreatorOptions={viewCreatorOptions}
        enablePerformanceMonitors={true} // see description in the README (https://www.npmjs.com/package/@itwin/desktop-viewer-react)
        uiProviders={[ new CameraPathWidgetProvider()]}
        onIModelConnected = {iModelConnected}
        mapLayerOptions = {mapLayerOptions}
        tileAdminOptions = {tileAdminOptions}
      />
    </div>
  </div>
  );
};

export default App;
