import { readFileSync } from 'fs';
import * as ts from "typescript";
import { ImportClause } from './components/ImportClause';
import { ImportMerge } from './utils/ImportMerge';


let strategy= process.argv[2];
let base = process.argv[3];
let patch = process.argv[4];

if(strategy == "true"){
    merge(true, base, patch);
}else{
    merge(false, base, patch);
}

/**
 * Performs a merge of a patch and base file depending on the merge strategy
 * 
 * @export
 * @param {boolean} patchOverrides 
 * @param {string} fileBase 
 * @param {string} filePatch 
 * @returns {string} the result of the merge
 */
export function merge(patchOverrides: boolean, fileBase: string, filePatch: string): string {

    let sourceFile: ts.SourceFile = ts.createSourceFile(fileBase, readFileSync(fileBase).toString(), ts.ScriptTarget.ES2016, false);
    let sourceFilePatch: ts.SourceFile = ts.createSourceFile(filePatch, readFileSync(filePatch).toString(), ts.ScriptTarget.ES2016, true, (<any>ts).SyntaxKind[256]);
    let result: String[] = [];
    let columnsInfo: string = String();
    
    let importMerge: ImportMerge = new ImportMerge(sourceFile, sourceFilePatch);

    //Merge imports
    importMerge.merge();
    result.push(importMerge.addPatchImports());
    

    sourceFile.getChildAt(0).getChildren().forEach(child => {
        if (child.kind == ts.SyntaxKind.ClassDeclaration) {
            let classDecl = <ts.ClassDeclaration>child;
            let classDeclPatch: ts.ClassDeclaration;
            sourceFilePatch.getChildAt(0).getChildren().forEach(childPatch => {
                if (childPatch.kind == ts.SyntaxKind.ClassDeclaration) {
                    classDeclPatch = <ts.ClassDeclaration>childPatch;
                }
            })
            if (classDecl.name.text == classDeclPatch.name.text) {
                if (patchOverrides) {

                    //get decorators, modifiers and heritages of class from patch file
                    getDecorators(classDeclPatch, sourceFilePatch, result);
                    getModifiers(classDeclPatch, sourceFilePatch, result);
                    result.push(" class ", classDeclPatch.name.text);
                    getHeritages(classDeclPatch, sourceFilePatch, result);
                    result.push(" {\n");
                    //TODO -- finish classMerge with patchOverrides = true

                } else {
                    //get decorators of base file testing if it anyone is NgModule decorator merging it if it is
                    getClassDecoratorWithNgModuleCase(classDecl, classDeclPatch, sourceFile, sourceFilePatch, result);
                    
                    //get modifiers and heritages of class from base file
                    getModifiers(classDecl, sourceFile, result);
                    result.push(" class ", classDecl.name.text);
                    getHeritages(classDecl, sourceFile, result);
                    result.push(" {\n");

                    //merge methods and properties of classes
                    let methodsBase: string[] = [];
                    let propertiesBase: string[] = [];
                    let methodsToAdd: string[] = [];

                    //check which patch methods are nonexistents at base methods
                    if (classDecl.members) {
                        classDecl.members.forEach(member => {
                            if (member.kind == ts.SyntaxKind.MethodDeclaration) {
                                methodsBase.push((<ts.Identifier>(<ts.MethodDeclaration>member).name).text);
                            }
                        });
                        if (classDeclPatch.members) {
                            classDeclPatch.members.forEach(memberPatch => {
                                if (memberPatch.kind == ts.SyntaxKind.MethodDeclaration) {
                                    if (methodsBase.indexOf((<ts.Identifier>(<ts.MethodDeclaration>memberPatch).name).text) < 0 || patchOverrides) {
                                        methodsToAdd.push(memberPatch.getFullText(sourceFilePatch));
                                    } else if (patchOverrides) {
                                        methodsToAdd.push(memberPatch.getFullText(sourceFilePatch));
                                    }
                                }

                            })
                        }
                    }
                    if (classDecl.members) {
                        classDecl.members.forEach(member => {
                            if (member.kind == ts.SyntaxKind.PropertyDeclaration) {
                                let propIdentifier: string = (<ts.Identifier>(<ts.PropertyDeclaration>member).name).text;
                                switch (propIdentifier) {
                                    case "cobigen_columns":
                                        let columnsPatch: ts.PropertyDeclaration;
                                        for (let memberPatch of classDeclPatch.members) {
                                            if (memberPatch.kind == ts.SyntaxKind.PropertyDeclaration) {
                                                if ((<ts.Identifier>memberPatch.name).text == "cobigen_columns") {
                                                    columnsPatch = (<ts.PropertyDeclaration>memberPatch);
                                                    break;
                                                }
                                            }
                                        }
                                        if (columnsPatch) {
                                            if (patchOverrides) {
                                                columnsInfo = columnsPatch.initializer.getFullText(sourceFilePatch) + ";";
                                                result.push(columnsPatch.getFullText(sourceFilePatch));
                                            } else {
                                                let resultArray: string = "";
                                                let arrayPatch: ts.ArrayLiteralExpression = <ts.ArrayLiteralExpression>columnsPatch.initializer;
                                                let arrayBase: ts.ArrayLiteralExpression = <ts.ArrayLiteralExpression>(<ts.PropertyDeclaration>member).initializer;
                                                if ((<ts.PropertyDeclaration>member).type) {
                                                    result.push("\n  ", propIdentifier, ":", (<ts.PropertyDeclaration>member).type.getFullText(sourceFile), " = [");
                                                } else {
                                                    result.push("\n  ", propIdentifier, " = [");
                                                }

                                                arrayBase.elements.forEach(element => {
                                                    resultArray = resultArray + "    " + element.getText(sourceFile);
                                                    if (arrayBase.elements.indexOf(element) != arrayBase.elements.length - 1) {
                                                        resultArray = resultArray + ",";
                                                    }
                                                })
                                                arrayPatch.elements.forEach(element => {
                                                    if (resultArray.indexOf(element.getText(sourceFilePatch)) == -1) {
                                                        resultArray = resultArray + ",    " + element.getText(sourceFilePatch);
                                                    }
                                                })
                                                columnsInfo = columnsInfo + "[" + resultArray + "\n];\n";
                                                result.push(resultArray, "\n  ];\n");
                                            }
                                        } else {
                                            result.push(member.getText(sourceFile));
                                        }
                                        break;
                                    case "cobigen_searchTerms":
                                        let itemTermPatch: ts.PropertyDeclaration;
                                        for (let memberPatch of classDeclPatch.members) {
                                            if (memberPatch.kind == ts.SyntaxKind.PropertyDeclaration) {
                                                if ((<ts.Identifier>memberPatch.name).text == "cobigen_searchTerms") {
                                                    itemTermPatch = (<ts.PropertyDeclaration>memberPatch);
                                                    break;
                                                }
                                            }
                                        }
                                        if (patchOverrides) {
                                            result.push(itemTermPatch.getText(sourceFilePatch));
                                        } else {
                                            let resultObject: string = "";
                                            let objectPatch: ts.ObjectLiteralExpression = <ts.ObjectLiteralExpression>itemTermPatch.initializer;
                                            let objectBase: ts.ObjectLiteralExpression = <ts.ObjectLiteralExpression>(<ts.PropertyDeclaration>member).initializer;
                                            if ((<ts.PropertyDeclaration>member).type) {
                                                result.push("\n  ", propIdentifier, ":", (<ts.PropertyDeclaration>member).type.getFullText(sourceFile), " = {");
                                            } else {
                                                result.push("\n  ", propIdentifier, " = {");
                                            }
                                            objectBase.properties.forEach(property => {
                                                resultObject = resultObject + property.getText(sourceFile);
                                                if (objectBase.properties.indexOf(property) != objectBase.properties.length - 1) {
                                                    resultObject = resultObject + ",";
                                                }
                                            })
                                            objectPatch.properties.forEach(propertyPatch => {
                                                if (resultObject.indexOf(propertyPatch.getText(sourceFilePatch)) == -1) {
                                                    resultObject = resultObject + "," + propertyPatch.getText(sourceFilePatch);
                                                }
                                            })
                                            result.push(resultObject, "\n  };\n");
                                        }
                                        break;
                                    case "cobigen_item":
                                        let itemObjectPatch: ts.PropertyDeclaration;
                                        for (let memberPatch of classDeclPatch.members) {
                                            if (memberPatch.kind == ts.SyntaxKind.PropertyDeclaration) {
                                                if ((<ts.Identifier>memberPatch.name).text == "cobigen_item") {
                                                    itemObjectPatch = (<ts.PropertyDeclaration>memberPatch);
                                                    break;
                                                }
                                            }
                                        }
                                        if (patchOverrides) {
                                            result.push(itemObjectPatch.getFullText(sourceFilePatch));
                                        } else {
                                            let resultObject: string = "";
                                            let objectPatch: ts.ObjectLiteralExpression = <ts.ObjectLiteralExpression>itemObjectPatch.initializer;
                                            let objectBase: ts.ObjectLiteralExpression = <ts.ObjectLiteralExpression>(<ts.PropertyDeclaration>member).initializer;
                                            if ((<ts.PropertyDeclaration>member).type) {
                                                result.push("\n  ", propIdentifier, ":", (<ts.PropertyDeclaration>member).type.getText(sourceFile), " = {");
                                            } else {
                                                result.push("\n  ", propIdentifier, " = {");
                                            }
                                            objectBase.properties.forEach(property => {
                                                resultObject = resultObject + property.getText(sourceFile);
                                                if (objectBase.properties.indexOf(property) != objectBase.properties.length - 1) {
                                                    resultObject = resultObject + ",";
                                                }
                                            })
                                            objectPatch.properties.forEach(propertyPatch => {
                                                if (resultObject.indexOf(propertyPatch.getText(sourceFilePatch)) == -1) {
                                                    resultObject = resultObject + "," + propertyPatch.getText(sourceFilePatch);
                                                }
                                            })
                                            result.push(resultObject, "\n  };\n");
                                        }
                                        break;
                                    default:
                                        let identifier: string = (<ts.Identifier>(<ts.PropertyDeclaration>member).name).text;
                                        let exists: boolean = true;
                                        for (let propertyPatch of classDeclPatch.members) {
                                            if (propertyPatch.kind == ts.SyntaxKind.PropertyDeclaration) {
                                                if (identifier == (<ts.Identifier>(<ts.PropertyDeclaration>propertyPatch).name).text && patchOverrides) {
                                                    result.push(propertyPatch.getText(sourceFilePatch));
                                                    exists = true;
                                                    break;
                                                } else if (identifier == (<ts.Identifier>(<ts.PropertyDeclaration>propertyPatch).name).text && !patchOverrides) {
                                                    result.push(member.getText(sourceFile));
                                                    exists = true;
                                                    break;
                                                } else {
                                                    exists = false;
                                                }
                                            }
                                        }
                                        if (!exists) {
                                            result.push(member.getText(sourceFile));
                                            exists = true;
                                        }
                                }
                            } else if (member.kind == ts.SyntaxKind.Constructor) {
                                if (patchOverrides) {
                                    let hasConstructor = false;
                                    for (let memberPatch of classDeclPatch.members) {
                                        if (memberPatch.kind == ts.SyntaxKind.Constructor) {
                                            result.push(memberPatch.getText(sourceFilePatch));
                                            hasConstructor = true;
                                            break;
                                        }
                                    }
                                    if (!hasConstructor) {
                                        result.push(member.getText(sourceFile));
                                    }
                                } else {
                                    result.push(member.getText(sourceFile));
                                }

                            } else if (member.kind == ts.SyntaxKind.MethodDeclaration) {
                                //get patch methods unexistent at base fileBase
                                let identifier: string = (<ts.Identifier>(<ts.MethodDeclaration>member).name).text;
                                if (patchOverrides) {
                                    let hasMethod = false;

                                    for (let memberPatch of classDeclPatch.members) {
                                        if (memberPatch.kind == ts.SyntaxKind.MethodDeclaration) {
                                            if ((<ts.Identifier>(<ts.MethodDeclaration>memberPatch).name).text == identifier) {
                                                result.push(memberPatch.getFullText(sourceFilePatch));
                                                hasMethod = true;
                                            }
                                        }
                                    }
                                    if (!hasMethod) {
                                        result.push(member.getText(sourceFile));
                                    }
                                } else {
                                    let exists: boolean = false;
                                    for (let memberPatch of classDeclPatch.members) {
                                        if (memberPatch.kind == ts.SyntaxKind.MethodDeclaration) {
                                            let identifierPatch: string = (<ts.Identifier>(<ts.MethodDeclaration>memberPatch).name).text;
                                            if (identifier == (<ts.Identifier>(<ts.MethodDeclaration>memberPatch).name).text) {
                                                let methodPatch = <ts.MethodDeclaration>memberPatch;
                                                let methodBase = <ts.MethodDeclaration>member;
                                                exists = true;
                                                let properties: string[] = [];
                                                switch (identifier) {
                                                    case "getData":
                                                        result.push("\n\n");
                                                        getDecorators(methodBase, sourceFile, result);
                                                        // if (methodBase.decorators) {
                                                        //     methodBase.decorators.forEach(decorator => {
                                                        //         result.push(decorator.getText(sourceFile));
                                                        //     })
                                                        // }
                                                        getModifiers(methodBase, sourceFile, result);
                                                        // if (methodBase.modifiers) {
                                                        //     methodBase.modifiers.forEach(modifier => {
                                                        //         result.push(modifier.getText(sourceFile));
                                                        //     })
                                                        // }
                                                        result.push(identifier, "(");
                                                        if (methodBase.parameters) {
                                                            methodBase.parameters.forEach(parameter => {
                                                                result.push(parameter.getText(sourceFile));
                                                            })
                                                        }
                                                        result.push(")");
                                                        if (methodBase.type) {
                                                            result.push(":", methodBase.type.getFullText(sourceFile));
                                                        }
                                                        result.push("{\n");
                                                        if (methodBase.body) {
                                                            if (methodBase.body.statements) {
                                                                methodBase.body.statements.forEach(statement => {
                                                                    if (statement.kind == ts.SyntaxKind.VariableStatement) {
                                                                        let identifier: string = (<ts.Identifier>(<ts.VariableStatement>statement).declarationList.declarations[0].name).text;
                                                                        if (identifier == "cobigen_pageData") {
                                                                            if ((<ts.VariableStatement>statement).declarationList.declarations[0].initializer) {
                                                                                let initializer = (<ts.VariableStatement>statement).declarationList.declarations[0].initializer;
                                                                                if (initializer.kind == ts.SyntaxKind.ObjectLiteralExpression) {
                                                                                    if ((<ts.ObjectLiteralExpression>initializer).properties) {
                                                                                        result.push("let ", identifier, " = {");

                                                                                        (<ts.ObjectLiteralExpression>initializer).properties.forEach(prop => {
                                                                                            properties.push(prop.getText(sourceFile));
                                                                                            result.push(prop.getText(sourceFile));
                                                                                            if (!((<ts.ObjectLiteralExpression>initializer).properties.indexOf(prop) == (<ts.ObjectLiteralExpression>initializer).properties.length - 1)) {
                                                                                                result.push(",");
                                                                                            }
                                                                                        })
                                                                                    }
                                                                                    if (methodPatch.body.statements) {
                                                                                        methodPatch.body.statements.forEach(stmntPatch => {
                                                                                            if (stmntPatch.kind == ts.SyntaxKind.VariableStatement) {
                                                                                                let identifierPatch: string = (<ts.Identifier>(<ts.VariableStatement>stmntPatch).declarationList.declarations[0].name).text;
                                                                                                if (identifierPatch == "cobigen_pageData") {
                                                                                                    if ((<ts.VariableStatement>statement).declarationList.declarations[0].initializer) {
                                                                                                        let initializerPatch = (<ts.VariableStatement>stmntPatch).declarationList.declarations[0].initializer;
                                                                                                        if (initializerPatch.kind == ts.SyntaxKind.ObjectLiteralExpression) {
                                                                                                            if ((<ts.ObjectLiteralExpression>initializerPatch).properties) {
                                                                                                                (<ts.ObjectLiteralExpression>initializerPatch).properties.forEach(propPatch => {
                                                                                                                    if (propPatch.getText(sourceFilePatch).indexOf("pagination") < 0) {
                                                                                                                        if (properties.indexOf(propPatch.getText(sourceFilePatch)) < 0) {
                                                                                                                            result.push("," + propPatch.getText(sourceFilePatch));
                                                                                                                        }
                                                                                                                    }
                                                                                                                })
                                                                                                            }
                                                                                                        }
                                                                                                    }
                                                                                                }
                                                                                            }
                                                                                        })
                                                                                    }
                                                                                    result.push("\n};");
                                                                                }
                                                                            }
                                                                        } else {
                                                                            result.push(statement.getText(sourceFile));
                                                                        }
                                                                    } else {
                                                                        result.push(statement.getText(sourceFile));
                                                                    }
                                                                })
                                                            }
                                                        }
                                                        result.push("\n}");
                                                        break;
                                                    case "saveData":
                                                        result.push("\n\n");
                                                        if (methodBase.decorators) {
                                                            methodBase.decorators.forEach(decorator => {
                                                                result.push(decorator.getText(sourceFile));
                                                            })
                                                        }
                                                        if (methodBase.modifiers) {
                                                            methodBase.modifiers.forEach(modifier => {
                                                                result.push(modifier.getText(sourceFile));
                                                            })
                                                        }
                                                        result.push(identifier, "(");
                                                        if (methodBase.parameters) {
                                                            methodBase.parameters.forEach(parameter => {
                                                                result.push(parameter.getText(sourceFile));
                                                            })
                                                        }
                                                        result.push(")");
                                                        if (methodBase.type) {
                                                            result.push(":", methodBase.type.getText(sourceFile));
                                                        }
                                                        result.push("{\n");
                                                        if (methodBase.body) {
                                                            if (methodBase.body.statements) {
                                                                methodBase.body.statements.forEach(statement => {
                                                                    if (statement.kind == ts.SyntaxKind.VariableStatement) {
                                                                        let identifier: string = (<ts.Identifier>(<ts.VariableStatement>statement).declarationList.declarations[0].name).text;
                                                                        if (identifier == "cobigen_obj") {
                                                                            if ((<ts.VariableStatement>statement).declarationList.declarations[0].initializer) {
                                                                                let initializer = (<ts.VariableStatement>statement).declarationList.declarations[0].initializer;
                                                                                if (initializer.kind == ts.SyntaxKind.ObjectLiteralExpression) {
                                                                                    if ((<ts.ObjectLiteralExpression>initializer).properties) {
                                                                                        result.push("let ", identifier, " = {");

                                                                                        (<ts.ObjectLiteralExpression>initializer).properties.forEach(prop => {
                                                                                            properties.push(prop.getText(sourceFile));
                                                                                            result.push(prop.getText(sourceFile));
                                                                                            if (!((<ts.ObjectLiteralExpression>initializer).properties.indexOf(prop) == (<ts.ObjectLiteralExpression>initializer).properties.length - 1)) {
                                                                                                result.push(",");
                                                                                            }
                                                                                        })
                                                                                    }
                                                                                    if (methodPatch.body.statements) {
                                                                                        methodPatch.body.statements.forEach(stmntPatch => {
                                                                                            if (stmntPatch.kind == ts.SyntaxKind.VariableStatement) {
                                                                                                let identifierPatch: string = (<ts.Identifier>(<ts.VariableStatement>stmntPatch).declarationList.declarations[0].name).text;
                                                                                                if (identifierPatch == "cobigen_obj") {
                                                                                                    if ((<ts.VariableStatement>statement).declarationList.declarations[0].initializer) {
                                                                                                        let initializerPatch = (<ts.VariableStatement>stmntPatch).declarationList.declarations[0].initializer;
                                                                                                        if (initializerPatch.kind == ts.SyntaxKind.ObjectLiteralExpression) {
                                                                                                            if ((<ts.ObjectLiteralExpression>initializerPatch).properties) {
                                                                                                                (<ts.ObjectLiteralExpression>initializerPatch).properties.forEach(propPatch => {
                                                                                                                    if (properties.indexOf(propPatch.getText(sourceFilePatch)) < 0) {
                                                                                                                        result.push("," + propPatch.getText(sourceFilePatch));
                                                                                                                    }
                                                                                                                })
                                                                                                            }
                                                                                                        }
                                                                                                    }
                                                                                                }
                                                                                            }
                                                                                        })
                                                                                    }
                                                                                    result.push("\n}");
                                                                                }
                                                                            }
                                                                        } else {
                                                                            result.push(statement.getText(sourceFile));
                                                                        }
                                                                    } else {
                                                                        result.push(statement.getText(sourceFile));
                                                                    }
                                                                })
                                                            }
                                                        }
                                                        result.push("\n}");
                                                        break;
                                                    case "ngDoCheck":
                                                        result.push("\n\n");
                                                        if (methodBase.decorators) {
                                                            methodBase.decorators.forEach(decorator => {
                                                                result.push(decorator.getFullText(sourceFile));
                                                            })
                                                        }
                                                        if (methodBase.modifiers) {
                                                            methodBase.modifiers.forEach(modifier => {
                                                                result.push(modifier.getFullText(sourceFile));
                                                            })
                                                        }

                                                        result.push(identifier, "(");
                                                        if (methodBase.parameters) {
                                                            methodBase.parameters.forEach(parameter => {
                                                                result.push(parameter.getFullText(sourceFile));
                                                            })
                                                        }
                                                        result.push(")");
                                                        if (methodBase.type) {
                                                            result.push(":", methodBase.type.getFullText(sourceFile));
                                                        }
                                                        result.push("{\n");
                                                        if (methodBase.body) {
                                                            if (methodBase.body.statements) {
                                                                methodBase.body.statements.forEach(statement => {
                                                                    if (statement.kind == ts.SyntaxKind.IfStatement) {
                                                                        let ifStmnt = <ts.IfStatement>statement;
                                                                        if (ifStmnt.expression.getFullText(sourceFile).indexOf("this.language !== this.translate.currentLang") >= 0) {
                                                                            result.push("    if(", ifStmnt.expression.getFullText(sourceFile), ") {\n");
                                                                            let stmnt = <ts.Block>(<ts.IfStatement>statement).thenStatement;
                                                                            if (stmnt.statements) {
                                                                                stmnt.statements.forEach(stat => {
                                                                                    if (stat.kind == ts.SyntaxKind.ExpressionStatement) {
                                                                                        let exprStmnt = <ts.ExpressionStatement>stat;
                                                                                        if (exprStmnt.expression.kind == ts.SyntaxKind.BinaryExpression) {
                                                                                            let binaryExpr = <ts.BinaryExpression>exprStmnt.expression;
                                                                                            if (binaryExpr.left.kind == ts.SyntaxKind.PropertyAccessExpression) {
                                                                                                let propExpr = <ts.PropertyAccessExpression>binaryExpr.left;
                                                                                                if (propExpr.name.text == "cobigen_columns") {
                                                                                                    result.push(binaryExpr.left.getFullText(sourceFile), binaryExpr.operatorToken.getFullText(sourceFile), " ", columnsInfo);
                                                                                                } else {
                                                                                                    result.push(binaryExpr.getFullText(sourceFile), ";");
                                                                                                }
                                                                                            }
                                                                                        } else {
                                                                                            result.push(exprStmnt.getFullText(sourceFile), ";");
                                                                                        }
                                                                                    } else {
                                                                                        result.push(stat.getFullText(sourceFile), ";");
                                                                                    }
                                                                                })
                                                                            }
                                                                            result.push("    }");
                                                                        } else {
                                                                            result.push(ifStmnt.getFullText(sourceFile));
                                                                        }
                                                                    } else {
                                                                        result.push(statement.getFullText(sourceFile));
                                                                    }
                                                                })
                                                            }
                                                        }
                                                        result.push("\n}");
                                                        break;
                                                    default:
                                                        result.push(member.getFullText(sourceFile));
                                                        exists = true;
                                                        break;
                                                }
                                            }
                                        }
                                    }
                                    if (!exists) {
                                        result.push(member.getText(sourceFile));
                                        exists = false;
                                    }
                                }
                            }
                        })
                        result.push(methodsToAdd.join(""));
                    }
                }
                result.push("\n}");
            }else{
                result.push(classDecl.getFullText(sourceFile));
            }
        } else if (child.kind == ts.SyntaxKind.VariableStatement) {
            let variableBase: ts.VariableStatement = <ts.VariableStatement>child;
            if ((<ts.Identifier>variableBase.declarationList.declarations[0].name).text == "appRoutes") {
                let variablePatch: ts.VariableStatement;
                let routesInitPatch: ts.ArrayLiteralExpression;
                for (let childPatch of sourceFilePatch.getChildAt(0).getChildren()) {
                    if (childPatch.kind == ts.SyntaxKind.VariableStatement) {
                        variablePatch = <ts.VariableStatement>childPatch;
                        let identifierPatch = (<ts.Identifier>variablePatch.declarationList.declarations[0].name).text;
                        if (identifierPatch == "appRoutes") {
                            routesInitPatch = <ts.ArrayLiteralExpression>variablePatch.declarationList.declarations[0].initializer;
                            break;
                        }
                    }
                }
                if (routesInitPatch) {
                    if (patchOverrides) {
                        result.push(variablePatch.getFullText(sourceFilePatch));
                    } else {
                        let routes: ts.ArrayLiteralExpression = <ts.ArrayLiteralExpression>variableBase.declarationList.declarations[0].initializer;
                        if (variableBase.decorators) {
                            variableBase.decorators.forEach(decorator => {
                                result.push(decorator.getFullText(sourceFile));
                            });
                        }
                        if (variableBase.modifiers) {
                            variableBase.modifiers.forEach(modifier => {
                                result.push(modifier.getFullText(sourceFile));
                            });
                        }
                        result.push("\n\nconst appRoutes: Routes = [");
                        let components: string[] = [];
                        routes.elements.forEach(element => {
                            let object: ts.ObjectLiteralExpression = <ts.ObjectLiteralExpression>element;
                            object.properties.forEach(property => {
                                let assigment: ts.PropertyAssignment = <ts.PropertyAssignment>property;
                                components.push((<ts.Identifier>assigment.initializer).text);
                            });
                            result.push(element.getFullText(sourceFile));
                            if (routes.elements.indexOf(element) != routes.elements.length - 1) {
                                result.push(",");
                            }
                        });
                        routesInitPatch.elements.forEach(elementPatch => {
                            let object: ts.ObjectLiteralExpression = <ts.ObjectLiteralExpression>elementPatch;
                            if(components.indexOf((<ts.Identifier>(<ts.PropertyAssignment>object.properties[0]).initializer).text) < 0){
                                result.push("," + elementPatch.getFullText(sourceFilePatch));
                                components.push((<ts.Identifier>(<ts.PropertyAssignment>object.properties[0]).initializer).text);
                            }
                        });
                        result.push("\n]");
                    }
                }

            } else {
                result.push(variableBase.getFullText(sourceFile));
            }
        } else if(child.kind != ts.SyntaxKind.ImportDeclaration){
            result.push(child.getFullText(sourceFile));
        }
    })
    console.log(result.join(""));
    return result.join("");
}


function getDecorators(node: ts.Node, source: ts.SourceFile, result: String []){
    if (node.decorators) {
        node.decorators.forEach(decorator => {
            result.push(decorator.getFullText(source));
        })
    }  
}

function getModifiers(node: ts.Node, source: ts.SourceFile, result: String []){
    if (node.modifiers) {
        node.modifiers.forEach(modifier => {
            result.push(modifier.getFullText(source));
        })
    }
}

function getHeritages(node: ts.ClassDeclaration, source: ts.SourceFile, result: String []){
    if (node.heritageClauses) {
        node.heritageClauses.forEach(heritage => {
            result.push(heritage.getFullText(source));
        })
    }
}

function getClassDecoratorWithNgModuleCase(classDecl: ts.ClassDeclaration, classDeclPatch: ts.ClassDeclaration, sourceFile: ts.SourceFile, sourceFilePatch: ts.SourceFile, result: String[]){
    if (classDecl.decorators) {
        classDecl.decorators.forEach(decorator => {
            if (decorator.getFullText(sourceFile).indexOf("NgModule") >= 0) {
                result.push("\n@NgModule({\n");
                interface properties {
                    key: string,
                    values: string[]
                };
                let arrayProperties: properties[] = [];
                if (classDeclPatch.decorators) {
                    for (let decoratorPatch of classDeclPatch.decorators) {
                        if (decoratorPatch.getFullText(sourceFilePatch).indexOf("NgModule") >= 0) {
                            if ((<ts.CallExpression>decoratorPatch.expression).arguments) {
                                if ((<ts.ObjectLiteralExpression>(<ts.CallExpression>decoratorPatch.expression).arguments[0]).properties) {
                                    (<ts.ObjectLiteralExpression>(<ts.CallExpression>decoratorPatch.expression).arguments[0]).properties.forEach(propertyPatch => {
                                        let elements: string[] = [];
                                        if ((<ts.PropertyAssignment>propertyPatch).initializer.kind == ts.SyntaxKind.ArrayLiteralExpression) {
                                            let array: ts.ArrayLiteralExpression = (<ts.ArrayLiteralExpression>(<ts.PropertyAssignment>propertyPatch).initializer);
                                            array.elements.forEach(element => {
                                                elements.push(element.getFullText(sourceFilePatch));
                                            });
                                            arrayProperties.push({ key: (<ts.Identifier>propertyPatch.name).text, values: elements });
                                        }

                                    });
                                }
                            }
                            break;
                        }
                    }
                }
                if ((<ts.CallExpression>decorator.expression).arguments) {
                    if ((<ts.ObjectLiteralExpression>(<ts.CallExpression>decorator.expression).arguments[0]).properties) {
                        (<ts.ObjectLiteralExpression>(<ts.CallExpression>decorator.expression).arguments[0]).properties.forEach(property => {
                            result.push((<ts.Identifier>property.name).text + ": [");
                            let elements: string[] = [];
                            if ((<ts.PropertyAssignment>property).initializer.kind == ts.SyntaxKind.ArrayLiteralExpression) {
                                let arrayBase: string[] = [];
                                let elements = (<ts.ArrayLiteralExpression>(<ts.PropertyAssignment>property).initializer).elements;
                                elements.forEach(elem => {
                                    arrayBase.push(elem.getFullText(sourceFile));
                                    result.push(elem.getFullText(sourceFile), ",");
                                });
                                arrayProperties.forEach(prop => {
                                    if (prop.key == (<ts.Identifier>property.name).text) {
                                        prop.values.forEach(proPatch => {
                                            if (arrayBase.indexOf(proPatch) < 0) {
                                                result.push(proPatch);
                                                if(arrayBase.indexOf(proPatch) < arrayBase.length - 1){
                                                    result.push(",");
                                                }
                                            }
                                        });
                                    }
                                });
                                result.push("\n],\n");
                            }
                        });
                    }
                }
                result.push("})\n")

            } else {
                result.push(decorator.getFullText(sourceFile) + "\n");
            }
        })
    }
}

export default merge;