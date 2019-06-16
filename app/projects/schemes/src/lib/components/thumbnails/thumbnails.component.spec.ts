import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { nameOfClass, TestingModule } from 'testing';
import { SchemesThumbnailsComponent } from './thumbnails.component';
import { SchemesTestingModule } from '../../schemes.testing.module';
import { ScreenshotSize } from '../../model/screenshot';

describe(nameOfClass(SchemesThumbnailsComponent), () =>
{
    let component: SchemesThumbnailsComponent;
    let fixture: ComponentFixture<SchemesThumbnailsComponent>;

    beforeEach(async(() =>
    {
        TestBed.configureTestingModule({
            declarations: [SchemesThumbnailsComponent],
            imports: [SchemesTestingModule.forRoot(), TestingModule.forRoot()]
        }).compileComponents();
    }));

    beforeEach(() =>
    {
        fixture = TestBed.createComponent(SchemesThumbnailsComponent);
        component = fixture.componentInstance;
        component.screenshots = [{
            title: '', urls: {
                [ScreenshotSize.Small]: ''
            }
        }];
        fixture.detectChanges();
    });

    it('should create', () =>
    {
        expect(component).toBeTruthy();
    });
});
