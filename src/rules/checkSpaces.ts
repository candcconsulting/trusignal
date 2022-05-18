import {
    EmphasizeElements,
    IModelApp,
    NotifyMessageDetails,
    OutputMessagePriority,
    StandardViewId,
  } from "@itwin/core-frontend";

  import { UiFramework } from "@itwin/appui-react";

function myfind(a : any, value: any) : any
{
    for (const item of a) {
        if (item.code.toUpperCase() === value.toUpperCase())
        {
            return item
        }
    }
    return undefined
}

export async function checkSpaces () : Promise<void>{
/* 
 load the BS1192.json rules
 and validate against them
*/
    IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, " starting Space checks ..."));
    const rules = require("./check_Spaces.json");
    const invalidElements:any = [];
    for (const ruleset of Object.keys(rules.rules))
    {
        const aRule = rules.rules[ruleset];
        IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, " rule " + aRule.id));

        const aQuery = aRule.checksql
        const aResults = UiFramework.getIModelConnection()!.query(aQuery);
        for await (const aResult of aResults) {
            
            invalidElements.push(aResult.id);
        }
    }
    let emph = EmphasizeElements.getOrCreate(IModelApp.viewManager.selectedView!);      
    emph.wantEmphasis = true;  
    //IModelApp.viewManager.selectedView!.zoomToElements(invalidElements, { animateFrustumChange: true, standardViewId: StandardViewId.RightIso});
    emph.emphasizeElements(invalidElements, IModelApp.viewManager.selectedView!, undefined , true)

}