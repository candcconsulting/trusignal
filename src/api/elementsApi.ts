import { BentleyStatus, Id64Array } from "@itwin/core-bentley";
import { GeometryContainmentRequestProps } from "@itwin/core-common";
import { IModelConnection, ScreenViewport } from "@itwin/core-frontend";
import {  ClipPlaneContainment, ClipVector, Matrix3d, Point3d, Range3d, Transform, Vector3d } from "@itwin/core-geometry";
import { InstanceKey } from "@itwin/presentation-common";
import { CameraPathPoint } from "./cameraPathApi";

export interface SpatialElement extends Record<string, string | undefined>, InstanceKey {
  name: string | undefined;
}

export enum SectionOfColoring {
  InsideTheBox = "Inside",
  OutsideTheBox = "Outside",
  Overlap = "Overlap",
}

export enum ElementPosition {
  InsideTheBox = "Inside",
  Overlap = "Overlap",
}

/* Getting elements that are inside or overlapping the given range*/
  export async function getSpatialElements(conn: IModelConnection, range: Range3d): Promise<SpatialElement[]> {
    const query = `SELECT e.ECInstanceId,  ec_classname(e.ECClassId, 's:c')  FROM bis.SpatialElement e JOIN bis.SpatialIndex i ON e.ECInstanceId=i.ECInstanceId WHERE i.MinX<=${range.xHigh} AND i.MinY<=${range.yHigh} AND i.MinZ<=${range.zHigh} AND i.MaxX >= ${range.xLow} AND i.MaxY >= ${range.yLow} AND i.MaxZ >= ${range.zLow}`;
    const elementsAsync = conn.query(query);
    const elements: SpatialElement[] = [];
    for await (const element of elementsAsync) {
      elements.push({ id: element[0], className: element[1], name: undefined });
    }

    return elements;
  }

// Return inscribed xy polygon points given a radius and number of sides...

function getPoints(radius: number, numSides: number): Point3d[] {
  const pts: Point3d[] = [];
  const delta = (Math.PI * 2.0) / numSides;
  let angle = 0;
  const center = Point3d.create();
  const rtmp = Point3d.create();
  
  for (let i = 0; i < numSides; i++, angle += delta) {
    const stmp = Point3d.create();
    rtmp.x = radius * Math.cos(angle);
    rtmp.y = radius * Math.sin(angle);
    rtmp.z = 0;
    center.plus(rtmp, stmp);
    pts.push(stmp);
  }
  return pts;
}

 



  export async function getClassifiedElements(vp: ScreenViewport, conn: IModelConnection, candidates: SpatialElement[], aCameraPoint: CameraPathPoint ): Promise<Record<ElementPosition, SpatialElement[]> | undefined>{
    let vpclip = vp.view.getViewClip();
    if (vpclip === undefined) {
      // Given array of 2 points for center of top and base of cylinder and known radius...
      const xyPoints = getPoints(0.15, 8); // <- Octagon...
      const dir = Vector3d.createStartEnd(aCameraPoint.targetPoint, aCameraPoint.eyePoint);
      const matrix = Matrix3d.createRigidHeadsUp(dir);
      const transform = Transform.createOriginAndMatrix(aCameraPoint.targetPoint, matrix);
      // NOTE: Just pass undefined for zLow and zHigh if you want a clip that extends through entire model...
      const points : Point3d[] = [];
      points.push(aCameraPoint.targetPoint)
      points.push(aCameraPoint.eyePoint)

      const zExtents = transform.multiplyInversePoint3dArray(points);
      const zLow = zExtents ? zExtents[0].z : undefined;
      const zHigh = zExtents ? zExtents[1].z : undefined;
      const clip = ClipVector.createEmpty();
      clip.appendShape(xyPoints, zLow, zHigh, transform);
      vp.view.setViewClip(clip)

    }      
    vpclip = vp.view.getViewClip();
    if (vpclip  === undefined) {
      console.log ("viewport clip is not defined")
      return;
    }
    const candidatesId = candidates.map((candidate) => candidate.id) as Id64Array;
    const classifiedElements = {
      [ElementPosition.InsideTheBox]: [] as SpatialElement[],
      [ElementPosition.Overlap]: [] as SpatialElement[],
    };

    const requestProps: GeometryContainmentRequestProps = {
      candidates: candidatesId,
      clip: vpclip.toJSON(),
      allowOverlaps: true,
      viewFlags: vp.viewFlags.toJSON(),
    };

    const result = await conn.getGeometryContainment(requestProps);
    if (BentleyStatus.SUCCESS !== result.status || undefined === result.candidatesContainment)
      return;

    result.candidatesContainment.forEach((val: ClipPlaneContainment, index: number) => {
      switch (val) {
        case ClipPlaneContainment.StronglyInside:
          classifiedElements[ElementPosition.InsideTheBox].push(candidates[index]);
          break;
        case ClipPlaneContainment.Ambiguous:
          classifiedElements[ElementPosition.Overlap].push(candidates[index]);
          break;
      }
    });

    return classifiedElements;
  }

  export function createRange(aCameraPoint : CameraPathPoint) {
    const lowX = Math.min(aCameraPoint.eyePoint.x, aCameraPoint.targetPoint.x)      
    const lowY = Math.min(aCameraPoint.eyePoint.y, aCameraPoint.targetPoint.y)      
    const lowZ = Math.min(aCameraPoint.eyePoint.z, aCameraPoint.targetPoint.z)      
    const highX = Math.max(aCameraPoint.eyePoint.x, aCameraPoint.targetPoint.x)      
    const highY = Math.max(aCameraPoint.eyePoint.y, aCameraPoint.targetPoint.y)      
    const highZ = Math.max(aCameraPoint.eyePoint.z, aCameraPoint.targetPoint.z)
    return new Range3d(lowX, lowY, lowZ, highX, highY, highZ)
  }

