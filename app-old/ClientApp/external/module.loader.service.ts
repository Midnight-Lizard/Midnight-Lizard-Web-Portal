﻿import "rxjs";
import { Injectable, NgModuleFactoryLoader, NgModuleFactory, Compiler, Type } from '@angular/core';
import { HttpHeaders } from "@angular/common/http";
import { Store } from "@ngrx/store";

import { Settings } from '../app/models/settings.model';
import { SideService, Side } from '../shared/side.service';
import { ExternalModule, ExternalPath } from './external.module';
import { RouterFailModule } from '../loading/router.fail.module';
import { RootState } from "../app/store/app.state";
import * as Act from "../app/store/app.actions";
import { ExternalScriptLoader } from "./script.loader.service";
import { buildUrl } from "../shared/url.helper";


@Injectable()
export class ExternalModuleLoader implements NgModuleFactoryLoader
{
    protected readonly _modulesCache = new Map<ExternalModule, any>();
    protected readonly _modules: {[p in typeof ExternalModule[keyof typeof ExternalModule]]: string}

    constructor(
        protected readonly env: SideService,
        protected readonly compiler: Compiler,
        protected readonly store$: Store<RootState>,
        protected readonly scriptLoader: ExternalScriptLoader,
        protected readonly settings: Settings)
    {
        this._modules = {
            [ExternalModule.SchemesModule]: buildUrl(settings.schemesUrl, '/dist/schemes-module')
        }
    }

    protected loadExternalModule(moduleName: ExternalModule, side: Side = Side.Client)
    {
        if (this._modulesCache.has(moduleName))
        {
            return Promise.resolve(this._modulesCache.get(moduleName));
        }
        else 
        {
            let moduleCodePromise = Promise.resolve("");
            if (this.env.isClientSide && side === Side.Client)
            {
                moduleCodePromise = this.store$.select(x => x.ML.externalModuleScripts)
                    .map(scripts => scripts.find(s => s.moduleName === moduleName))
                    .map(x => x ? x.script : "").take(1).toPromise();
            }

            const modulePromise = moduleCodePromise
                .then(code =>
                {
                    if (code)
                    {
                        return Promise.resolve({
                            body: code as string | null,
                            headers: undefined as HttpHeaders | undefined
                        });
                    }
                    else
                    {
                        return this.scriptLoader.load(this.getScriptUrl(moduleName, side));
                    }
                })
                .then(code =>
                {
                    const exports = { default: {} as any };
                    eval(code.body!);
                    this.evaluateExternalModule(moduleName, code.headers);
                    return exports.default;
                })
                .then(module => module, error =>
                {
                    console.error(error);
                    return RouterFailModule;
                });
            modulePromise.then(m => this._modulesCache.set(moduleName, m));
            return modulePromise;
        }
    }

    load(modulePath: ExternalPath): Promise<NgModuleFactory<any>>
    {
        const moduleName = ExternalModule[modulePath.split("#").pop() as keyof typeof ExternalModule];
        let sides = [this.loadExternalModule(moduleName, this.env.side)];
        if (this.env.isServerSide)
        {
            sides.push(this.scriptLoader.load(this.getScriptUrl(moduleName, Side.Client)));
        }
        return Promise.all(sides).then(([module, script]) =>
        {
            script && this.store$.dispatch(new Act.ExternalModuleScriptDownloded({
                moduleName: moduleName,
                script: script
            }));
            return this.compiler.compileModuleSync(module);
        });
    }

    protected getScriptUrl(moduleName: ExternalModule, side: Side)
    {
        return `${this._modules[moduleName]}-${side}.js`;
    }

    protected evaluateExternalModule(moduleName: ExternalModule, headers?: HttpHeaders): void
    {
        let settings: any | undefined;
        if (headers && headers.has("settings"))
        {
            const settingsHeaders = headers.get("settings");
            if (settingsHeaders)
            {
                settings = settingsHeaders.split(",").reduce(
                    (payload, setting) => payload[setting] = headers.get(setting), {} as any);
            }
        }
        this.store$.dispatch(new Act.ExternalModuleEvaluated({ moduleName, settings }));
    }
}
