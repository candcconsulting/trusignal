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

export async function checkUniclass () : Promise<void>{
/* 
 load the BS1192.json rules
 and validate against them
*/
    IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, " starting uniclass checks ..."));
    const rules = require("./BS1192.json");
    const invalidElements:any = [];
    for (const ruleset of Object.keys(rules.rules))
    {
        const aRule = rules.rules[ruleset];
        IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, " rule " + aRule.id));

        const aQuery = aRule.checksql
        const aResults = UiFramework.getIModelConnection()!.query(aQuery);
        for await (const aResult of aResults) {
            let aFound = undefined;
            console.log("Searching for " + aResult.param1)            
            aFound = myfind(aRule.content, aResult.param1)
            if (!aFound) {
                IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, aResult.param1 + " is not a valid entry"));
                const instanceQuery = aRule.elementsql.replace('<param1>', aResult.param1);
                console.log('Searching for ' + instanceQuery);
                const invalidResults = UiFramework.getIModelConnection()!.query(instanceQuery);
                for await (const invalidResult of invalidResults) {
                    invalidElements.push(invalidResult.id);
                }

            }
            else
            {
                console.log(aResult.param1 + " is defined as " + aFound.description)
            }
        }
    }
    let emph = EmphasizeElements.getOrCreate(IModelApp.viewManager.selectedView!);      
    emph.wantEmphasis = true;  
    IModelApp.viewManager.selectedView!.zoomToElements(invalidElements, { animateFrustumChange: true, standardViewId: StandardViewId.RightIso});
    emph.emphasizeElements(invalidElements, IModelApp.viewManager.selectedView!, undefined , true)

}