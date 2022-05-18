import { ColorDef, FeatureAppearance, FeatureOverrideType } from "@itwin/core-common";
import { EmphasizeElements, IModelConnection, Viewport } from "@itwin/core-frontend";
import { KeySet } from "@itwin/presentation-common";
import { HiliteSetProvider } from "@itwin/presentation-frontend";

const getElementIdHiliteSet = async function(elementIds: string[], iModel: IModelConnection) {
  if(iModel.isOpen) {
    const provider = HiliteSetProvider.create({imodel: iModel});
    const keys = elementIds.map(function(id: any){
      return {id, className: "BisCore:GeometricElement"};
    });
    let keyset = new KeySet(keys);
    const set = await provider.getHiliteSet(keyset);
    if (set.elements === undefined)
      return [];
    return [...set.elements, ...elementIds];
  }
  return []
}

export async function emphasizeResults(vp : Viewport, results : string[]) {
  const emph = EmphasizeElements.getOrCreate(vp);            
  emph.clearEmphasizedElements(vp);
  emph.clearOverriddenElements(vp);            
  const ecResult = results.map(x => x[0]);
  //const allElements = ecResult;
  const allElements = await getElementIdHiliteSet(ecResult, vp.iModel);
  emph.overrideElements(allElements, vp, ColorDef.red, FeatureOverrideType.ColorOnly, true);
  emph.emphasizeElements(allElements,vp, undefined, true);
  vp.iModel.selectionSet.emptyAll();
  for (const es of allElements.values()) {
    vp.iModel.selectionSet.add(es);
  }
  vp.zoomToElements(allElements);
}
