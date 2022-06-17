/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AbstractWidgetProps, StagePanelLocation, StagePanelSection, UiItemsProvider, WidgetState } from "@itwin/appui-abstract";
import { UiFramework, useActiveViewport } from "@itwin/appui-react";
import { EmphasizeElements, IModelApp, rangeToCartographicArea, ScreenViewport, Viewport } from "@itwin/core-frontend";
import { SvgPause, SvgPlay } from "@itwin/itwinui-icons-react";
import { Alert, Button, IconButton, LabeledInput, LabeledSelect, SelectOption, Slider, ToggleSwitch } from "@itwin/itwinui-react";
import CameraPathApi, { CameraPath } from "../../api/cameraPathApi";
import { CameraPathTool } from "../tools/cameraPathTool";
import "./cameraPath.scss";
import { KeySet } from "@itwin/presentation-common";
import { Presentation, SelectionChangeEventArgs } from "@itwin/presentation-frontend";
import { BeDuration, Id64String } from "@itwin/core-bentley";
import { BackgroundMapType, ColorDef, DisplayStyle3dSettingsProps, FeatureAppearance, GeometricElement3dProps, GeometryStreamIterator, Placement3d, RenderMode, SkyBoxProps, TerrainHeightOriginMode, ViewFlagProps } from "@itwin/core-common";
import { Cone, LineString3d, Point3d, PolyfaceBuilder, StrokeOptions } from "@itwin/core-geometry";
import { createRange, getClassifiedElements, getSpatialElements, SectionOfColoring } from "../../api/elementsApi";
import { VolumeQueryApi } from "../../api/VolumeQueryApi";
import { GeometryDecorator } from "../../utils/GeometryDecorator";
import { viewWithUnifiedSelection } from "@itwin/presentation-components";
import { ViewportComponent } from "@itwin/imodel-components-react";

const SimpleViewport = viewWithUnifiedSelection(ViewportComponent);

const defaultSkyBox: SkyBoxProps = { display: true, twoColor: false, groundColor: 9741199, nadirColor: 5464143, skyColor: 16764303, zenithColor: 16741686 };

const renderingStyleViewFlags: ViewFlagProps = {
  noConstruct: true,
  noCameraLights: false,
  noSourceLights: false,
  noSolarLight: false,
  visEdges: false,
  hidEdges: false,
  shadows: false,
  monochrome: false,
  ambientOcclusion: false,
  thematicDisplay: false,
  renderMode: RenderMode.SmoothShade,
};


const speeds: SelectOption<number>[] = [
  { value: 44.704, label: "100 Mph: Train" },
  { value: 26.8224, label: "60 Mph: Car" },
  { value: 2.23520, label: "5 Mph: Walking" },
  { value: 13.4112, label: "30 Mph: Car" },
  { value: 67.0500, label: "150 Mph: Airplane" },
];

const paths: SelectOption<string>[] = [
  { value: "E1", label: "E1" },
  { value: "W1A", label: "W1A" },
  { value: "W3A", label: "W3A"},
  { value: "W3B", label: "W3B" },
  { value: "W4", label: "W4" },
];

interface SelectedElement extends Record<string, string> {
  elementId: string;
  className: string;
}

const CameraPathWidget = () => {
  const viewport = useActiveViewport();
  const [cameraPath, setCameraPath] = useState<CameraPath>(new CameraPath(paths[0].value));
  const [isPaused, setIsPaused] = useState<boolean>(true);
  const [sliderValue, setSliderValue] = useState<number>(0);
  const [distanceValue, setDistanceValue] = useState<number>(0);
  const [speed, setSpeed] = useState<number>(speeds[0].value);
  const [elementsAreSelected, setElementsAreSelected] = useState<boolean>(false);
  const selectedElements = useRef<KeySet>(new KeySet());
  const [capturedPathElements, setCapturedPathElements] = useState<SelectedElement[]>([]);
  const [capturedTargetElements, setCapturedTargetElements] = useState<SelectedElement[]>([]);
  const [volumeBoxState, setVolumeBoxState] = React.useState<boolean>(true);
  const iModelConnection = viewport?.iModel
  const [decoratorState, setDecoratorState] = React.useState<GeometryDecorator>();


  // private functions

  const findFloatingViewPort = () => {
    for (const viewPort of IModelApp.viewManager) {
      console.log(viewPort)
    }
  }

  const _onSelectionChanged = (event: SelectionChangeEventArgs) => {
    selectedElements.current = new KeySet(event.keys);
    setElementsAreSelected(!event.keys.isEmpty);
  };

  const _onChangeCameraSliderValue = (sliderNumber: number) => {
    setIsPaused(true);
    setSliderValue(sliderNumber);
  };

  // Update the States for the Play / Pause button click event
  const _handleCameraPlay = () => {
    if (sliderValue >= 1) {
      setSliderValue(0);
    }
    setIsPaused(!isPaused);
  };

  const keyDown = useRef<boolean>(false);

  const handleUnlockDirection = (isKeyDown: boolean) => {
    keyDown.current = isKeyDown;
  };

  const _handleScrollPath = useCallback(async (eventDeltaY: number) => {
    if (viewport === undefined || cameraPath === undefined)
      return;
    setSliderValue((prevSliderValue) => {
      if (((prevSliderValue === 1) && (eventDeltaY > 0)) || ((prevSliderValue === 0) && (eventDeltaY < 0)))
        return prevSliderValue;

      const stepLength = (cameraPath.getLength() / 10) / 30;
      let cameraPathIterationValue: number = prevSliderValue;

      if (eventDeltaY > 0)
        cameraPathIterationValue += 0.009;
      else
        cameraPathIterationValue -= 0.009;

      // If we go over
      if (cameraPathIterationValue > 1) cameraPathIterationValue = 1;
      if (cameraPathIterationValue < 0) cameraPathIterationValue = 0;

      setIsPaused(true);
      const nextPathFraction = cameraPath.advanceAlongPath(cameraPathIterationValue, stepLength);
      const nextPathPoint = cameraPath.getPathPoint(nextPathFraction);
      CameraPathApi.changeCameraPositionAndTarget(nextPathPoint, viewport, keyDown.current);

      return nextPathFraction;
    });
  }, [viewport, cameraPath, keyDown]);

  const handleScrollAnimation = useCallback((eventDeltaY: number) => {
    setIsPaused(true);
    _handleScrollPath(eventDeltaY)
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.error(error);
      });
  }, [_handleScrollPath]);



  /** Turn the camera on, and initialize the tool */
  useEffect(() => {
    if (viewport) {
      setInitialView(viewport);
      CameraPathApi.prepareView(viewport);
      setTimeout(() => { void IModelApp.tools.run(CameraPathTool.toolId, handleScrollAnimation, handleUnlockDirection); }, 10);
      /*
        // Create a child window.  Any elements we render in here will have access
        //  the IModelApp and be in the same javascript scope
        const secondWindow = UiFramework.childWindowManager.openChildWindow("popout-vp", "Viewport",
        // Specify the Viewport to be rendered in the child window
        (<SimpleViewport
      
            itemId  ="floatingViewPort"
            imodel={viewport.iModel}            
            />),
            // Delare the size and location of child window
            { height: 600, width: 400, left: 10, top: 50},
            false,
          );
      // We will use this method to activate the CameraPathTool
      // The CameraPathTool will prevent the view tool and standard mouse events
      findFloatingViewPort();
      */
    }
  }, [handleScrollAnimation, viewport]);

useEffect(() => {
  setDistanceValue(cameraPath.distanceToTarget(sliderValue))
}, [cameraPath, sliderValue]);

  /** When the slider Value is changed, change the view to reflect the position in the path */
  useEffect(() => {
    if (viewport && cameraPath && isPaused) {
      const nextPathPoint = cameraPath.getPathPoint(sliderValue);
      CameraPathApi.changeCameraPositionAndTarget(nextPathPoint, viewport);
    }
  }, [viewport, sliderValue, cameraPath, isPaused]);

  useEffect(() => {
    let animID: number;
    if (!isPaused && cameraPath && viewport) {
      const animate = (currentPathFraction: number) => {
        if (currentPathFraction < 1) {
          const nextPathFraction = cameraPath.advanceAlongPath(currentPathFraction, speed / 30);
          const nextPathPoint = cameraPath.getPathPoint(nextPathFraction);
          CameraPathApi.changeCameraPositionAndTarget(nextPathPoint, viewport, keyDown.current);
          setSliderValue(nextPathFraction);
          animID = requestAnimationFrame(() => {
            animate(nextPathFraction);
          });
        } else {
          setIsPaused(true);
        }
      };
      animID = requestAnimationFrame(() => animate(sliderValue));
    }
    return () => {
      if (animID) {
        cancelAnimationFrame(animID);
      }
    };
    // This effect should NOT be called when the sliderValue is changed because the animate value sets the slider value. It is only needed on initial call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraPath, speed, isPaused, viewport]);


  useEffect(() => {
    // Subscribe for unified selection changes
    // Change the default selection scope. Top-assembly scope returns key of selected element's topmost parent element (or just the element if it has no parents)
    Presentation.selection.scopes.activeScope = "top-assembly";
    Presentation.selection.selectionChange.addListener(_onSelectionChanged);
  }, []);

  

  /** Initialize the camera namespace on widget load */
  useEffect(() => {
    void IModelApp.localization.registerNamespace("camera-i18n-namespace");
    CameraPathTool.register("camera-i18n-namespace");

    return () => {
      IModelApp.localization.unregisterNamespace("camera-i18n-namespace");
      IModelApp.tools.unRegister(CameraPathTool.toolId);
    };
  }, []);


  // button code
  
  const capturePath = async () => {
    let elements: SelectedElement[] = [];
    const iModel = viewport?.iModel
    selectedElements.current.instanceKeys.forEach((values, key) => {
      const classElements = Array.from(values)
        .filter((value) => capturedPathElements.find((e) => e.elementId === value) === undefined)
        .map((value) => ({ elementId: value, className: key }));
      elements = elements.concat(classElements);
    });
        setCapturedPathElements(capturedPathElements.concat(elements));
    if (iModel) {
      const element = elements[0].elementId as Id64String;
      const geoElement = await iModel.elements.loadProps(element, {wantGeometry : true});
      if (geoElement) {
        const temp: any = geoElement;
        try {
          const geoStream = GeometryStreamIterator.fromGeometricElement3d(temp);
          for (const entry of geoStream) {
            if ('geometryQuery' === entry.primitive.type) {
              const geometry = entry.primitive.geometry;                
                        // In here you can deal with the curve
                        // There’s no reason to deal with individual points.
                        // The cameraPath sample code just takes the input points and builds a curve anyway.
              cameraPath.setPathFromLine(geometry as LineString3d)        
            }
          }
        }
        catch (error) {
          const err = error as Error;
          console.log(err.message)
        }
      }
    };
    setSliderValue(0);
  }
  const showProps = async () => {
    const iModel = viewport?.iModel
    let elements: SelectedElement[] = [];

    selectedElements.current.instanceKeys.forEach((values, key) => {
      const classElements = Array.from(values)
        .filter((value) => capturedPathElements.find((e) => e.elementId === value) === undefined)
        .map((value) => ({ elementId: value, className: key }));
      elements = elements.concat(classElements);
    });

    const element = elements[0].elementId as Id64String;
    const elemProps = (await iModel?.elements.getProps(element)) as GeometricElement3dProps[];
    console.log(elemProps)      
    if (elemProps.length !== 0) {
      elemProps.forEach((prop: GeometricElement3dProps) => {
        const placement = Placement3d.fromJSON(prop.placement);
        const range = placement.calculateRange();
        console.log(range)    
      })
    }
  }
  async function waitForSceneCompletion(viewport: Viewport): Promise<void> {
    if (viewport.areAllTileTreesLoaded && viewport.numRequestedTiles === 0)
      return;
  
    await BeDuration.wait(100);
    return waitForSceneCompletion(viewport);
  }
  const takeSnapshot = async () => {
    const viewPort = IModelApp.viewManager.getFirstOpenView();
    if (viewPort !== undefined) {
      const clonedView = viewPort.view.clone();
      const zoom = document.getElementById('zoom') as HTMLInputElement;
      const x = document.getElementById('xPoint') as HTMLInputElement;
      const y = document.getElementById('yPoint') as HTMLInputElement;
      const z = document.getElementById('zPoint') as HTMLInputElement;
      let zoomFactor = 0.1;
      if (Number.isNaN(parseFloat(zoom.value)))
        zoomFactor = 1 / (distanceValue / 10);
      else
        zoomFactor = parseFloat(zoom.value);
      const returnZoomValue = viewPort.zoom(undefined,zoomFactor);
      await BeDuration.wait(100);
      await waitForSceneCompletion(viewPort);
      console.log("Zoom Factor " + zoomFactor + " returned : " + returnZoomValue);
      const canvas = viewPort.readImageToCanvas();
      const imageUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      const fileName = "Targetx"+x.value+"y"+y.value+"z"+z.value+"Distance"+distanceValue +".png";
      link.setAttribute("download", fileName);
      link.setAttribute("href", imageUrl);
      link.click();
      viewPort.changeView(clonedView);
    }
  }


  const captureTarget = async () => {
    const iModel = viewport?.iModel
    let elements: SelectedElement[] = [];

    selectedElements.current.instanceKeys.forEach((values, key) => {
      const classElements = Array.from(values)
        .filter((value) => capturedPathElements.find((e) => e.elementId === value) === undefined)
        .map((value) => ({ elementId: value, className: key }));
      elements = elements.concat(classElements);
    });

    setCapturedTargetElements(capturedTargetElements.concat(elements)); 
    let range: any;
    const element = elements[0].elementId as Id64String;
    const elemProps = (await iModel?.elements.getProps(element)) as GeometricElement3dProps[];
      if (elemProps.length !== 0) {
        elemProps.forEach((prop: GeometricElement3dProps) => {
          const placement = Placement3d.fromJSON(prop.placement);
          range = placement.calculateRange();
          console.log(range)
          cameraPath.setStaticTarget(range.high)
        });
      }
  };

  const clearTarget = () => {
    cameraPath.clearTarget();
    setSliderValue(0);
  }

  const validateTarget = async () => {
    if (!viewport) {
      return;
    }
    if (decoratorState)
      IModelApp.viewManager.dropDecorator(decoratorState);

    VolumeQueryApi.clearClips(viewport);

    const colors = {
      [SectionOfColoring.InsideTheBox]: ColorDef.red,
      [SectionOfColoring.Overlap]: ColorDef.blue,
      [SectionOfColoring.OutsideTheBox]: ColorDef.white,
    };
    const aCameraPoint = cameraPath.getPathPoint(sliderValue);
    const radius = .15;
    const aCone = Cone.createAxisPoints(aCameraPoint.eyePoint, aCameraPoint.targetPoint, radius, radius, true);

    const decorator = new GeometryDecorator();
    setDecoratorState(decorator);
  if (!aCone) {
      console.log ("could not make cone");
      return;
    }
    console.log("Cone created : @", aCameraPoint.eyePoint, aCameraPoint.targetPoint, " radius : ", radius )
    decorator.clearGeometry();
    const options = StrokeOptions.createForCurves();
    options.needParams = false;
    options.needNormals = false;
    const builder = PolyfaceBuilder.create(options);
    const nearPoint = cameraPath.getPathPoint(cameraPath.advanceAlongPath(sliderValue, distanceValue));
    const allPoints : Point3d [] = [];
    allPoints.push(aCameraPoint.targetPoint);
    allPoints.push(new Point3d(aCameraPoint.targetPoint.x, aCameraPoint.targetPoint.y, aCameraPoint.eyePoint.z));
    allPoints.push(aCameraPoint.eyePoint);
    allPoints.push(new Point3d(nearPoint.eyePoint.x, nearPoint.eyePoint.y, aCameraPoint.eyePoint.z));
    allPoints.push(new Point3d(nearPoint.eyePoint.x, nearPoint.eyePoint.y, aCameraPoint.targetPoint.z));
    
    builder.addCone(aCone);
    // builder.addPolygon(allPoints, 5)
    const polyface = builder.claimPolyface(false);
    decorator.setColor(ColorDef.green);
    decorator.addGeometry(polyface)
    IModelApp.viewManager.addDecorator(decorator);
    // const checkRange = (aCone?.range());
    const checkRange = createRange(aCameraPoint)
    console.log("Checking elements inside range ", checkRange)
    const candidates = await getSpatialElements(viewport.iModel, checkRange );
    const classifiedElements = await getClassifiedElements(viewport, viewport.iModel, candidates, aCameraPoint);
    if (!classifiedElements) {
      console.log("no classified elements found")
      return;
    }
    EmphasizeElements.getOrCreate(viewport).overrideElements(classifiedElements[SectionOfColoring.InsideTheBox].map((x) => x.id), viewport, colors[SectionOfColoring.InsideTheBox]);
    EmphasizeElements.getOrCreate(viewport).overrideElements(classifiedElements[SectionOfColoring.Overlap].map((x) => x.id), viewport, colors[SectionOfColoring.Overlap]);
    /* All elements that are not overridden are outside the box by default. So to color them we don't need to have elements ids.
    This is done so we would not need to query large amount of elements that are outside the box */
    EmphasizeElements.getOrCreate(viewport).defaultAppearance = FeatureAppearance.fromRgb(colors[SectionOfColoring.OutsideTheBox]);
  }

  const setTarget = () => {
    const xPoint = document.getElementById('xPoint') as HTMLInputElement;
    const yPoint = document.getElementById('yPoint') as HTMLInputElement;
    const zPoint = document.getElementById('zPoint') as HTMLInputElement;
    const XYZ = new Point3d(parseFloat(xPoint.value), parseFloat(yPoint.value), parseFloat(zPoint.value));
    cameraPath.setStaticTarget(XYZ);
  }

  const setInitialView = async (vp: ScreenViewport) => {
    // viewState.viewFlags.renderMode = RenderMode.SmoothShade;
    // viewport?.overrideDisplayStyle(viewState.getDisplayStyle3d())
    // why is W4 Geodetic
  
    let terrainOrigin = TerrainHeightOriginMode.Geoid
    if (vp.iModel.iModelId === "9e1eb16e-8c71-4880-9dc8-c107eb21cdd3" ){
       terrainOrigin = TerrainHeightOriginMode.Geodetic } 
    const displayStyle: DisplayStyle3dSettingsProps = {
      environment: {
        sky: defaultSkyBox,
        ground: { display: false },
      },
      viewflags: { ...renderingStyleViewFlags, shadows: false, ambientOcclusion: true, visEdges: false, noWeight: true,},
      backgroundMap: {
        useDepthBuffer: false,
        groundBias: 0,
        providerName: "BingProvider",
        providerData: {
          mapType: BackgroundMapType.Hybrid,
        },
        applyTerrain: true,
        transparency: 0.4,
        terrainSettings: {
          providerName: "CesiumWorldTerrain",
          applyLighting: false,
          heightOrigin: 0.0,
          exaggeration: 1.0,
          heightOriginMode: terrainOrigin,
        },
      }
    };
    // displayStyle.changeBackgroundMapProps({ applyTerrain: true })
    //      displayStyle.backgroundMapSettings = BackgroundMapSettings.fromJSON({
    //        applyTerrain: true,
    //        useDepthBuffer: false,
    //        transparency: 1,
    //        terrainSettings: TerrainSettings.fromJSON({ heightOrigin: 1, heightOriginMode: TerrainHeightOriginMode.Geoid }),
    //      });

    vp!.overrideDisplayStyle(displayStyle);    
    vp!.displayStyle.setOSMBuildingDisplay({ onOff: true });    
    return;

  }


  // Handle the Path Change
  const _onChangeRenderPath = (pathName: string) => {
    setSliderValue(0);
    setIsPaused(true);
    setCameraPath(new CameraPath(pathName));
  };

  return (
    <div className="sample-options">
      <div className="sample-grid">
      <div className="grid-item">
        <Button onClick={capturePath} disabled={!elementsAreSelected}>Set Path</Button>
        <Button onClick={captureTarget} disabled={!elementsAreSelected}>Set Target</Button>
        <Button onClick={showProps} disabled={!elementsAreSelected}>Show Properties</Button>
        <Button onClick={setTarget}>Set XYZ</Button>
        <Button onClick={clearTarget} >Clear Target</Button>
        <Button onClick={validateTarget} >Validate Target</Button>
        <Button onClick={takeSnapshot} >Take Snapshot</Button>
        <LabeledInput displayStyle = "inline" label = "Zoom" id = "zoom" width = "10"></LabeledInput>

        <ToggleSwitch label="Show Volume Box" checked={volumeBoxState} onChange={() => setVolumeBoxState((state) => !state)}  />


      </div>
      <div className="grid-item">
        <LabeledInput displayStyle = "inline" label = "X" id = "xPoint" width = "50"></LabeledInput>
        <LabeledInput displayStyle = "inline" label = "Y" id = "yPoint" width = "50"></LabeledInput>
        <LabeledInput displayStyle = "inline" label = "Z" id = "zPoint" width = "50"></LabeledInput>

      </div>
      <div className="grid-item">
        <LabeledInput displayStyle = "inline" label = "X Offset" id = "xOffset" onChange = {e => cameraPath.xOffset(parseFloat(e.target.value))} width = "50"></LabeledInput>
        <LabeledInput displayStyle = "inline" label = "Y Offset" id = "yOffset" onChange = {e => cameraPath.yOffset(parseFloat(e.target.value))} width = "50"></LabeledInput>
        <LabeledInput displayStyle = "inline" label = "Z Offset" id = "zOffset" onChange = {e => cameraPath.zOffset(parseFloat(e.target.value))} width = "50"></LabeledInput>
      </div>
        <div></div>
        <LabeledSelect label="Path:" size="small" displayStyle="inline" options={paths} value={cameraPath.pathName} onChange={_onChangeRenderPath} onShow={undefined} onHide={undefined} />
        <LabeledInput disabled={true} value={distanceValue.toFixed(3)}></LabeledInput>
        <div className="sample-options-control">
          <LabeledSelect label="Speed:" size="small" displayStyle="inline" options={speeds} value={speed} onChange={setSpeed} onShow={undefined} onHide={undefined} />
          <IconButton size="small" onClick={_handleCameraPlay} >
            {isPaused ? <SvgPlay /> : <SvgPause />}
          </IconButton>
        </div>
        <Slider
          className="sample-options-slider"
          values={[sliderValue]}
          min={0}
          minLabel="Progress Bar:"
          max={1}
          maxLabel=""
          onChange={(values) => _onChangeCameraSliderValue(values[0])}
          step={Math.pow(10, -10)} />
      </div>
      <Alert type="informational" className="instructions">
        Use the mouse wheel to scroll the camera along the predefined path. Click in the view to look around.
      </Alert>
    </div>
  );
};

export class CameraPathWidgetProvider implements UiItemsProvider {
  public readonly id: string = "CameraPathWidgetProvider";

  public provideWidgets(_stageId: string, _stageUsage: string, location: StagePanelLocation, _section?: StagePanelSection): ReadonlyArray<AbstractWidgetProps> {
    const widgets: AbstractWidgetProps[] = [];
    if (location === StagePanelLocation.Bottom) {
      widgets.push(
        {
          id: "CameraPathWidget",
          label: "Camera Path",
          defaultState: WidgetState.Open,
          getWidgetContent: () => <CameraPathWidget />,
        },
      );
    }
    return widgets;
  }
}
