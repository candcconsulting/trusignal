import {
    EmphasizeElements,
    IModelApp,
    NotifyMessageDetails,
    OutputMessagePriority,
    StandardViewId,
  } from "@itwin/core-frontend";
import evaluate from 'simple-evaluate';

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

function parse(str: string) {
    return Function(`'use strict'; return (${str})`)()
  }
  

export async function checkSpaces () : Promise<void>{
/* 
 load the BS1192.json rules
 and validate against them
*/
    IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, " starting Space checks ..."));
    const spaces = require("./check_Spaces1.json");
    const invalidElements:any = [];
    for (const aSpaceType of Object.keys(spaces.spaces))
    {
        const thisSpaceType = spaces.spaces[aSpaceType];
        console.log("Checking " + thisSpaceType.spaceName);
        const aQuery = thisSpaceType.checkSQL;        
        const theSpaces = UiFramework.getIModelConnection()!.query(aQuery);
        
        
        for await (const aSpace of theSpaces) {
            // now step through each space and check the
            const spaceResults:number[] = [];
            const spaceBox = "" + parseFloat(aSpace.origin.x + aSpace.bBoxLow.x).toFixed(2) + "," +
            parseFloat(aSpace.origin.y + aSpace.bBoxLow.y).toFixed(2) + "," +
            parseFloat(aSpace.origin.z + aSpace.bBoxLow.z).toFixed(2) + "," +
            parseFloat(aSpace.origin.x+ aSpace.bBoxHigh.x).toFixed(2) + "," + 
            parseFloat(aSpace.origin.y + aSpace.bBoxHigh.y).toFixed(2) + "," + 
            parseFloat(aSpace.origin.z + aSpace.bBoxHigh.z).toFixed(2)
            var thisLogic:string = "";
            thisLogic = thisSpaceType.logic;
            console.log("Checking space " + aSpace.userLabel)
            var i: number = 0;
            for (const aRule of Object.keys(thisSpaceType.rules)) {
                const thisRule = thisSpaceType.rules[aRule]
                let ruleQuery = thisRule.rule;
                ruleQuery = ruleQuery.replace( "<space_box>", spaceBox );
                // console.log("Checking rule " + ruleQuery);
                const theResults = UiFramework.getIModelConnection()!.query(ruleQuery);
                // we only get one result
                for await (const aResult of theResults)
                {
                    if (aResult.result >= thisRule.check) {
                        thisLogic = thisLogic.replace("<" + i + ">", String(1));
                    } else
                    {
                        thisLogic = thisLogic.replace("<" + i + ">", String(0));
                    }
                }
                // handle if there are no results
                thisLogic = thisLogic.replaceAll("<" + i + ">", String(0));
                i++;

            }
            const total = evaluate({},thisLogic);
            if (!total) {
                invalidElements.push(aSpace.id); 
            }
        }
            // invalidElements.push(aResult.id);

    }
    let emph = EmphasizeElements.getOrCreate(IModelApp.viewManager.selectedView!);      
    emph.wantEmphasis = true;  
    //IModelApp.viewManager.selectedView!.zoomToElements(invalidElements, { animateFrustumChange: true, standardViewId: StandardViewId.RightIso});
    emph.emphasizeElements(invalidElements, IModelApp.viewManager.selectedView!, undefined , true)

}