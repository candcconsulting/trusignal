import {
    EmphasizeElements,
    IModelApp,
    NotifyMessageDetails,
    OutputMessagePriority,
    StandardViewId,
  } from "@itwin/core-frontend";

  import { UiFramework } from "@itwin/appui-react";
import { BentleyAPIFunctions } from "../helper/BentleyAPIFunctions";
import { emphasizeResults } from "../common/common";
import { SetStateAction } from "react";
import { StringLiteralLike } from "typescript";
import { areEqualPossiblyUndefined } from "@itwin/core-bentley";

function myfind(a : any, value: any) : any
{
    try {
        for (const item of a) {
            if (item.code.toUpperCase() === value.toUpperCase())
            {
                return  item

            }
        }
    }
    catch(e) {
        const _e = e  as Error;
        console.log ("Error in myfind" + _e.message)
    }
    return undefined
}

class RuleInstance {
    name = "";
    description = "";
    severity = 1;
    ecSchema = "";
    ecClass = "";
    ecWhere = ""
    propertyName = "";
    functionName = ""
    pattern = ""
    lowerBound = ""
    upperBound = ""
    tags = ""
    dataType = 1;
    whereDataType = 1;

    public schemaFromClassandSchema(aClass: string) {
        return aClass.substring(0, aClass.indexOf("."));
    }
    public classFromClassandSchema(aClass: string) {
        return aClass.substring(aClass.indexOf(".") + 1);
    }

    public join (linker : string) {        
        return this.name + linker + 
            this.description + linker + 
            this.severity.toString() + linker + 
            this.ecSchema + linker +
            this.ecClass + linker +
            this.ecWhere + linker + 
            this.propertyName + linker + 
            this.functionName + linker + 
            this.pattern + linker + 
            this.lowerBound + linker + 
            this.upperBound + linker + 
            this.tags + linker +
            this.dataType.toString() + linker + 
            this.whereDataType.toString();
    }

}

export async function checkProperty (progressBar: any) : Promise<void>{
/* 
 load the BS1192.json rules
 and validate against them
*/
    IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, " starting Property checks ..."));
    const rules = require("./checkProperty.json");
    const invalidElements:any = [];
    let allRules : RuleInstance[] = [];
    const vp = IModelApp.viewManager.getFirstOpenView();
    if (!vp) {
        return
    }
    for (const ruleset of Object.keys(rules.rules))
    {
        const aRule = rules.rules[ruleset];
        IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, " rule " + aRule.id));


        const aQuery = "select distinct ec_classname(class.id, 's.c') as ecclass, pd.name, cd.displaylabel, pd.displaylabel from meta.ecpropertydef pd join bis.geometricelement3d ge on ge.ecclassid = pd.class.id join meta.ecclassdef cd on pd.class.id = cd.ecinstanceid where  (pd.DisplayLabel like '%" + aRule.property + "%' OR pd.Name like '%" + aRule.property + "%')"

        const aResults = await BentleyAPIFunctions._executeQuery(vp.iModel, aQuery);
        
        var i = 0;
        for await (const aResult of aResults) {
            // now we have a list of classes that are have a property with the required property name
            // now let's find the instances
            i = i + 1;
            switch (aRule.ruletype) {
                case "propertylist" : {
                    const aInstanceQuery = "select ecinstanceid as id, " + aResult[1] + " as propertyname from " + aResult[0] + "as el join bis.geometricelement3d as gw on gw.ecinstanceid = el.ecinstanceid ";
                    const aInstances = await BentleyAPIFunctions._executeQuery(vp.iModel, aInstanceQuery);
                    for await (const aInstance of aInstances) {
                        if (aInstance[0]) {
                            let aFound = undefined;
                            console.log("Searching Instance " + aInstance[0] + " for " + aResult[1]) ;                           
                            aFound = myfind(aRule.content, aInstance[1]);
                            if (!aFound) {
                                IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, aInstance[1] + " is not a valid entry"));
                                invalidElements.push(aInstance[0]);
                            }
                            else
                            {
                                console.log(aInstance[1] + " is defined as " + aFound.description)
                            }
                            // as we are not checking for properties with only instances we may be querying for classes with no instances
                        }
                    }
                    break;
                }
                case "propertyvalue" : {
                    let aInstanceQuery = aRule.checksql;
                    if (aResult[0].indexOf( 'Aspect') >= 0) {
                        aInstanceQuery = aInstanceQuery.replaceAll("<id>", 'element.id');
                    } else
                    {
                        aInstanceQuery = aInstanceQuery.replaceAll("<id>", 'ecinstanceid');
                    }

                    aInstanceQuery = aInstanceQuery.replaceAll("<classname>", aResult[0]);
                    aInstanceQuery = aInstanceQuery.replaceAll("<propertyname>", aResult[1]);
                    var aRuleInstance  = new RuleInstance() ;
                    aRuleInstance.name = aRule.id + i.toString();
                    const ecClass = aResult[2] || aRuleInstance.classFromClassandSchema(aResult[0]);
                    aRuleInstance.description = `For items of type ${ecClass} the property ${aResult[3]} must conform to the regular expression: ${aRule.pattern}`
                    aRuleInstance.ecClass = aRuleInstance.classFromClassandSchema(aResult[0]);
                    aRuleInstance.ecSchema = aRuleInstance.schemaFromClassandSchema(aResult[0]);
                    aRuleInstance.functionName = "Matches Pattern";
                    aRuleInstance.propertyName = aResult[1];
                    aRuleInstance.pattern = aRule.pattern.replaceAll("\\\\", "\\");
                    
                    allRules.push(aRuleInstance);

                    console.log("Checking : " + aInstanceQuery)
                    const aInstances = await BentleyAPIFunctions._executeQuery(vp.iModel, aInstanceQuery);
                    if (aInstances.length > 0) console.log("Found instances in : " + aInstanceQuery)

                    for await (const aInstance of aInstances) {
                        if (aInstance[0]) {
                                // IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, aInstance[1] + " is not a valid entry"));
                                invalidElements.push(aInstance[0]);
                            }
                            // as we are not checking for properties with only instances we may be querying for classes with no instances
                        }
                    }                    
                    break;

            }
            progressBar(i / aResults.length * 100)
        }
    }
    emphasizeResults(vp, invalidElements)
    progressBar('postive');
    const csvContent = "data:text/csv;charset=utf-8," + 
    "name,description,severity,ecSchema,ecClass,ecWhere,propertyName,functionName,pattern,lowerBound,upperBound,tags,dataType,whereDataType\n" +
    allRules.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "allRules.csv");
    document.body.appendChild(link); // Required for FF

    link.click();


}