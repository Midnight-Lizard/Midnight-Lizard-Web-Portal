﻿import { Injectable } from '@angular/core';
import { Effect, Actions } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { of, Observable, merge } from 'rxjs';
import { switchMap, filter, map, withLatestFrom, catchError } from 'rxjs/operators';
import
{
    createNavigationHandler, NotifyUser, NotificationLevel, AuthRootState,
    NavigationFailed, NotificationAction, MetaService
} from 'core';
import { SchemesState, SchemesRootState } from './schemes.state';
import { SchemesAction, SchemesActionTypes as SchActTypes } from './schemes.action-sets';
import * as SchActs from './schemes.actions';
import { SchemesService } from '../backend/schemes.service';
import { getFiltersFromRoute, filtersAreEqual } from '../model/schemes-filters';
import { getSchemesListFromRoute } from '../model/schemes-lists';
import { getSchemesIdFromRoute } from '../model/public-scheme';
import { ScreenshotSize } from '../model/screenshot';

const signinAction: NotificationAction[] = [{
    route: '/signin',
    infoTitle: 'SIGN IN',
    detailsTitle: 'SIGN IN',
    description: 'Sign in or create a new user'
}];

@Injectable()
export class SchemesEffects
{
    private readonly handleNavigation = createNavigationHandler(
        this.actions$, this.store$, (store) => store.SCHEMES.schemes);

    constructor(
        private readonly actions$: Actions<SchemesAction, typeof SchActs>,
        private readonly store$: Store<SchemesRootState & AuthRootState>,
        private readonly schSvc: SchemesService,
        private readonly meta: MetaService
    ) { }

    @Effect()
    currentSchemeChanged$ = this.actions$.ofType(SchActTypes.CurrentSchemeChanged).pipe(
        filter(event => !!event.payload.currentScheme),
        map(event =>
        {
            const scheme = event.payload.currentScheme!;
            this.meta.updatePageMetaData({
                title: `${scheme.name} - Midnight Lizard color scheme`,
                description: (scheme.description || '').trim(),
                image: scheme.screenshots[0].urls[ScreenshotSize.ExtraSmall]
            });
        })
    );

    @Effect()
    onDetailsNavigated$ = this.handleNavigation(/schemes\/index\/\w+\/[^?]/, (route, state) =>
    {
        const schemeId = getSchemesIdFromRoute(route);
        if (schemeId && (!state.currentScheme || state.currentScheme.id !== schemeId))
        {
            return merge(
                of(new SchActs.CurrentSchemeChanged({ currentScheme: undefined })),
                this.schSvc.getPublicSchemeDetails(schemeId).pipe(
                    map(scheme => new SchActs.CurrentSchemeChanged({ currentScheme: scheme })),
                    catchError(error => of(new NotifyUser({
                        message: 'Failed to retrieve color scheme details',
                        level: NotificationLevel.Error,
                        isLocal: true,
                        data: error
                    })))));
        }
        return of();
    });

    @Effect()
    onSearchNavigated$ = this.handleNavigation(/schemes\/index/, (route, state) =>
    {
        const filters = getFiltersFromRoute(route),
            list = getSchemesListFromRoute(route);
        if (list !== state.list || !filtersAreEqual(filters, state.filters))
        {
            return of(new SchActs.SchemesSearchChanged({
                filters: filters,
                list: list
            }));
        }
        return of();
    });

    @Effect()
    onSearchChanged$ = this.actions$.ofType(SchActTypes.SchemesSearchChanged).pipe(
        withLatestFrom(this.store$),
        switchMap(([act, state]) => this.schSvc.getPublicSchemes(
            act.payload.filters, act.payload.list, 10, state.AUTH.user, null).pipe(
                map(result => new SchActs.FirstSchemesChunkLoaded({
                    cursor: result.cursor,
                    data: result.results,
                    done: result.done
                })),
                catchError(error => of(new NotifyUser({
                    message: 'Failed to retrieve color schemes',
                    level: NotificationLevel.Error,
                    isLocal: true,
                    data: error
                })))
            )
        )
    );

    @Effect()
    loadNextChunk$ = this.actions$.ofType(SchActTypes.LoadNextSchemesChunk).pipe(
        withLatestFrom(this.store$),
        switchMap(([act, state]) => this.schSvc.getPublicSchemes(
            state.SCHEMES.schemes.filters, state.SCHEMES.schemes.list, 10,
            state.AUTH.user, state.SCHEMES.schemes.cursor).pipe(
                map(result => new SchActs.NextSchemesChunkLoaded({
                    cursor: result.cursor,
                    data: result.results,
                    done: result.done
                })),
                catchError(error => of(new NotifyUser({
                    message: 'Failed to retrieve more color schemes',
                    level: NotificationLevel.Error,
                    isLocal: true,
                    data: error
                })))
            ))
    );

    @Effect()
    likeScheme$ = this.actions$.ofType(SchActTypes.LikeScheme).pipe(
        withLatestFrom(this.store$),
        switchMap(([act, state]) =>
        {
            if (state.AUTH && state.AUTH.user)
            {
                // TODO: implement real like
                return of(new SchActs.SchemeLiked({
                    ...act.payload,
                    likes: 123
                })) as any;
            }
            return [
                new SchActs.LikeSchemeFailed(act.payload),
                new NotifyUser({
                    message: 'Please sign in to be able to like color schemes',
                    level: NotificationLevel.Info,
                    isLocal: true,
                    actions: signinAction
                })];
        })
    );

    @Effect()
    dislikeScheme$ = this.actions$.ofType(SchActTypes.DislikeScheme).pipe(
        withLatestFrom(this.store$),
        switchMap(([act, state]) =>
        {
            if (state.AUTH && state.AUTH.user)
            {
                // TODO: implement real dislike
                return of(new SchActs.SchemeDisliked({
                    ...act.payload,
                    likes: 123
                })) as any;
            }
            return [
                new SchActs.DislikeSchemeFailed(act.payload),
                new NotifyUser({
                    message: 'Please sign in to be able to manage your likes',
                    level: NotificationLevel.Info,
                    isLocal: true,
                    actions: signinAction
                })];
        })
    );

    @Effect()
    addSchemeToFavorites$ = this.actions$.ofType(SchActTypes.AddSchemeToFavorites).pipe(
        withLatestFrom(this.store$),
        switchMap(([act, state]) =>
        {
            if (state.AUTH && state.AUTH.user)
            {
                // TODO: implement real add
                return of(new SchActs.SchemeAddedToFavorites(act.payload)) as any;
            }
            return [
                new SchActs.AddSchemeToFavoritesFailed(act.payload),
                new NotifyUser({
                    message: 'Please sign in to be able to manage your favorites',
                    level: NotificationLevel.Info,
                    isLocal: true,
                    actions: signinAction
                })];
        })
    );

    @Effect()
    removeSchemeFromFavorites$ = this.actions$.ofType(SchActTypes.RemoveSchemeFromFavorites).pipe(
        withLatestFrom(this.store$),
        switchMap(([act, state]) =>
        {
            if (state.AUTH && state.AUTH.user)
            {
                // TODO: implement real remove
                return of(new SchActs.SchemeRemovedFromFavorites(act.payload)) as any;
            }
            return [
                new SchActs.RemoveSchemeFromFavoritesFailed(act.payload),
                new NotifyUser({
                    message: 'Please sign in to be able to manage your favorites',
                    level: NotificationLevel.Info,
                    isLocal: true,
                    actions: signinAction
                })];
        })
    );
}
