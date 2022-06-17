/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelApp, NotifyMessageDetails, OutputMessagePriority, Viewport } from "@itwin/core-frontend";
import { CurveChainWithDistanceIndex, CurveLocationDetail, LineString3d, Path, Point3d, Vector3d  } from "@itwin/core-geometry";
import { Point } from "@itwin/core-react";
import { E1, W1A, W3A, W3B, W4 } from "../routes/coordinates";

export interface CameraPathPoint {
  eyePoint: Point3d;
  targetPoint: Point3d;
}


/** This class implements the interaction between the sample and the iTwin.js API.  No user interface. */
export default class CameraPathApp {
  
  public static changeCameraPositionAndTarget(cameraPoint: CameraPathPoint, viewport: Viewport, changeCameraTargetOnly: boolean = false) {
    if (viewport.view.is3d()) {
      if (changeCameraTargetOnly) {
        viewport.view.setEyePoint(cameraPoint.eyePoint);
      } else {
        viewport.view.lookAt({ eyePoint: cameraPoint.eyePoint, targetPoint: cameraPoint.targetPoint, upVector: new Vector3d(0, 0, 1), lensAngle: viewport.view.camera.lens });
      }
    }
    viewport.synchWithView();
  }

  // Turn the viewport camera on
  public static prepareView(vp: Viewport) {
    vp.turnCameraOn();
    vp.synchWithView();
  }
}

// A CameraPath consists of a CurveChain representing the camera location and an array
// of TargetPoints representing the camera TargetPoint at each point.
export class CameraPath {
  private _path: CurveChainWithDistanceIndex | undefined;
  private _targetPoints: Point3d[] = [];
  private _xOffset = 0;
  private _yOffset = 0;
  private _zOffset = 0;

  
  constructor(public pathName: string) {
    if (pathName === "") {
      return;
      // we need to handle a geometry handler
    } else {
      const vp = IModelApp.viewManager.getFirstOpenView();
      const iModelName = vp?.iModel.name
      if (!iModelName) {
        // seems that timing means the model name could be blank
        return
      }
      let currentPathCoordinates: typeof E1 = [];

      switch (vp?.iModel.name) {
        case "ZZ.TRU East - E1 Signal Sighting":
          currentPathCoordinates = E1;
          break;
        case "AA. TRU East E1 - Coordination/Shared Model":
          currentPathCoordinates = E1;
          break;
        case "AG. TRU West - W1A - Coordination/Shared Model":
          currentPathCoordinates = W1A;
          break;
        case "AH. TRU West - W1B - Coordination/Shared Model":
          currentPathCoordinates = W1A;
          break;
        case "AI. TRU West - W2A - Coordination/Shared Model":
          currentPathCoordinates = W1A;
          break;
        case "West of Leeds - W3A - Coordination/Shared Model": //"AK. TRU West - W3A - Coordination - Shared Model":
          currentPathCoordinates = W3A;
          break;
        case "AL. TRU West - W3B - Coordination-Shared Model":
          currentPathCoordinates = W3B;
          break;
        case "West of Leeds - W4 - Coordination/Shared":
          currentPathCoordinates = W4;
          break;
        default:
          console.log("Model not listed in switch :<" + vp?.iModel.name + ">")
          switch (pathName) {
            case "E1":
              currentPathCoordinates = E1
              break;
            case  "W1A" : 
              currentPathCoordinates = W1A
              break;
            case "W3A":
              currentPathCoordinates = W3A
              break;
            case "W3B" :
              currentPathCoordinates = W3B
              break;
            case "W4":
              currentPathCoordinates = W4
              break
            default :
              console.log("Path not listed in switch :<" + pathName + ">")
              IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Warning, "Alignment not listed :<" + pathName + ">"));
              break;
          }
          break;
      }

    
      const targetPoints: Point3d[] = [];
      const directions: Point3d[] = [];
      let i = 0;
      // we need to drop the first direction point
      currentPathCoordinates.forEach((item) => {
        if (i === 0) {
          i = i + 1;
        } else {
          targetPoints.push(new Point3d(item.cameraPoint.x , item.cameraPoint.y , item.cameraPoint.z ));
          directions.push(new Point3d(item.cameraPoint.x , item.cameraPoint.y , item.cameraPoint.z ));
          i = i + 1;
        }
      });
      const line: LineString3d = LineString3d.create();
      // and the last camera point
      currentPathCoordinates.forEach((item) => {
          line.addPoint(new Point3d(item.cameraPoint.x , item.cameraPoint.y, item.cameraPoint.z));
      });
      const path = CurveChainWithDistanceIndex.createCapture(Path.create(line));
      if (path !== undefined) {
        this._path = path;
        this._targetPoints = targetPoints;
      }
    }
}
  public distanceXYZXYZ (x1 : number, y1 : number, z1 : number, x2 : number, y2 : number, z2 : number) {
    return Math.sqrt(Math.pow(x2 - x1,2) + Math.pow(y2 - y1,2) + Math.pow(z2 - z1,2))
  }

  public setPathFromLine(line: LineString3d) {
    const path = CurveChainWithDistanceIndex.createCapture(Path.create(line));
    if (path !== undefined) {
      this._path = path;      
    }
  }

  public setStaticTarget(target : Point3d) {
    const targetPoints: Point3d[] = [];
    targetPoints.push(target);
    this._targetPoints = targetPoints;
  }

  public clearTarget () {
    this._targetPoints = [];
  }

  public getLength() {
    if (!this._path)
      throw new Error("Path was not loaded");

    return this._path.curveLength();
  }

  public advanceAlongPath(currentFraction: number, distanceInMeters: number) {  // return the new fraction
    let globalFractionOfPathTravelled: number = 0;
    if (this._path)
      globalFractionOfPathTravelled = this._path.moveSignedDistanceFromFraction(currentFraction, distanceInMeters, false).fraction;
    return globalFractionOfPathTravelled;
  }

  public getPathPoint(fraction: number) {   // return CameraPoint
    if (!this._path)
      throw new Error("Path was not loaded");

    const tempeyePoint = this._path.fractionToPoint(fraction);
    const targetFraction = this._path.moveSignedDistanceFromFraction(fraction, 10, false).fraction;        
    let targetPoint = undefined;
    if ((this._targetPoints.length === 1) && (this._targetPoints[0] !== undefined))
    {
      targetPoint = this._targetPoints[0]
    } else
    {
      targetPoint = this._path.fractionToPoint(targetFraction);
    }
    //const targetPoint = this._getTargetPoint(eyePoint);
    const offsetEyePoint = new Point3d(tempeyePoint.x + this._xOffset, tempeyePoint.y + this._yOffset, tempeyePoint.z + this._zOffset)
    const eyePoint = offsetEyePoint
    return { eyePoint, targetPoint };
  }

  public distanceToTarget(fraction: number) : number {
    if (!this._path) {
      throw new Error("Path was not loaded");
      return 0}

    const eyePoint = this._path.fractionToPoint(fraction);
    const targetFraction = this._path.moveSignedDistanceFromFraction(fraction, 10, false).fraction;        
    let targetPoint = undefined;
    if ((this._targetPoints.length === 1) && (this._targetPoints[0] !== undefined))
    {
      targetPoint = this._targetPoints[0]
    } else
    {
      targetPoint = this._path.fractionToPoint(targetFraction);
    }
    return this.distanceXYZXYZ(eyePoint.x, eyePoint.y, eyePoint.z, targetPoint.x, targetPoint.y, targetPoint.z  )
  }

  public xOffset(n: number) {
    this._xOffset = n
  }
  public yOffset(n: number) {
    this._yOffset = n
  }
  public zOffset(n: number) {
    this._zOffset = n
  }

  private _getTargetPoint(point: Point3d) {
    if (!this._path)
      throw new Error("Path was not loaded");

    // Based on the current point, figure out which segment we are on, and how far along that segment.
    const detail = this._path.closestPoint(point, false);
    if (!detail || !detail.childDetail)
      throw new Error("Invalid path");

    const lineString = detail.childDetail.curve as LineString3d;
    const numPoints = lineString.packedPoints.length;
    const { segmentIndex, segmentFraction } = this._getSegmentIndexAndLocalFraction(detail, numPoints);

    // If we are standing on the last point, just return the last point
    if (numPoints - 1 === segmentIndex)
      return new Point3d(this._targetPoints[segmentIndex].x, this._targetPoints[segmentIndex].y, this._targetPoints[segmentIndex].z);

    // We are in between two points of the path, interpolate between the two points
    const prevTargetPoint = this._targetPoints[segmentIndex];
    const nextTargetPoint = this._targetPoints[segmentIndex + 1];
    return nextTargetPoint;
    /* return prevTargetPoint.interpolate(segmentFraction, nextTargetPoint); */
  }

  private _getSegmentIndexAndLocalFraction(detail: CurveLocationDetail, numPoints: number) {
    let segmentIndex: number = 0;
    let segmentFraction: number = 0;
    if (detail.childDetail) {
      const scaledFraction = detail.childDetail.fraction * (numPoints - 1);
      segmentIndex = Math.floor(scaledFraction);
      segmentFraction = scaledFraction - segmentIndex;
    }
    return { segmentIndex, segmentFraction };
  }
}
