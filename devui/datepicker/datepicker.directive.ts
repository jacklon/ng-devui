import {
  Directive, OnInit, Input, ElementRef, forwardRef, ComponentRef, ViewContainerRef, Output, EventEmitter,
  ComponentFactoryResolver, Renderer2, Injector, HostListener, TemplateRef, OnDestroy
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { DateConverter } from 'ng-devui/utils';
import { DatepickerComponent } from './datepicker.component';
import { SelectDateChangeEventArgs, SelectDateChangeReason } from './date-change-event-args.model';
import { DatePickerConfigService as DatePickerConfig } from './date-picker.config.service';
import { DefaultDateConverter } from 'ng-devui/utils';
import { I18nService, I18nInterface } from 'ng-devui/i18n';
import {
  animate,
  AnimationBuilder,
  AnimationMetadata,
  AnimationPlayer,
  style
} from '@angular/animations';
import { Subscription } from 'rxjs';

const easeInQuint = 'cubic-bezier(0.755, 0.05, 0.855, 0.06)';
const easeOutQuint = 'cubic-bezier(0.23, 1, 0.32, 1)';
const animationDuration = '200ms';

@Directive({
  selector: '[dDatepicker]:not([appendToBody])',
  exportAs: 'datepicker',
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => DatepickerDirective),
    multi: true
  }]
})
export class DatepickerDirective implements OnInit, OnDestroy, ControlValueAccessor {
  @Input() locale: string;
  @Input() cssClass: string;
  @Input() disabled: boolean;
  @Input() dateConverter: DateConverter;
  yearNumber = 12;
  @Input() direction: 'up' | 'down' = 'down';
  @Input() customViewTemplate: TemplateRef<any>;
  @Input() autoOpen = false;
  @Output() selectedDateChange = new EventEmitter<SelectDateChangeEventArgs>();
  selectedDate: Date;
  isOpen = false;
  _dateConfig: any;
  private _dateFormat: string;
  private _maxDate: Date;
  private _minDate: Date;
  private _showTime: boolean;
  private cmpRef: ComponentRef<DatepickerComponent>;
  private player: AnimationPlayer;
  private i18nSubscription: Subscription;
  private i18nLocale: I18nInterface['locale'];

  private onChange = (_: any) => null;
  private onTouched = () => null;

  @Input() set showTime(showTime: boolean) {
    this._showTime = showTime;
  }

  get showTime() {
    return typeof this._showTime === 'boolean' ? this._showTime : this.dateConfig.timePicker;
  }

  @Input() set dateConfig(dateConfig: any) {
    if (this.checkDateConfig(dateConfig)) {
      this._dateConfig = dateConfig;
    } else {
      this._dateConfig = this.datePickerConfig.dateConfig;
    }
    this._dateFormat = this.showTime ? this._dateConfig.format.time : this._dateConfig.format.date;
  }

  get dateConfig() {
    return this._dateConfig;
  }

  @Input() set dateFormat(dateFormat: string) {
    if (dateFormat && this._dateFormat !== dateFormat) {
      this._dateFormat = dateFormat;
      this.writeModelValue({selectedDate: this.selectedDate, reason: SelectDateChangeReason.format});
    }
  }

  get dateFormat() {
    return this._dateFormat;
  }

  @Input() set maxDate(date: Date | any) {
    const parseDate = this.dateConverter.parse(date, this.dateFormat, this.locale || this.i18nLocale);
    if (parseDate) {
      this._maxDate = parseDate;
    }
  }

  get maxDate() {
    return this._maxDate;
  }

  @Input() set minDate(date: Date | any) {
    const parseDate = this.dateConverter.parse(date, this.dateFormat, this.locale || this.i18nLocale);
    if (parseDate) {
      this._minDate = parseDate;
    }
  }

  get minDate() {
    return this._minDate;
  }

  constructor(private elementRef: ElementRef, private viewContainerRef: ViewContainerRef,
              private componentFactoryResolver: ComponentFactoryResolver, private renderer2: Renderer2,
              private injector: Injector, private datePickerConfig: DatePickerConfig, private i18n: I18nService,
              private builder: AnimationBuilder) {
    this._dateConfig = datePickerConfig['dateConfig'];
    this.dateConverter = datePickerConfig['dateConfig'].dateConverter || new DefaultDateConverter();
    this.selectedDate = null;
    const factory = this.componentFactoryResolver.resolveComponentFactory(DatepickerComponent);
    this.cmpRef = this.viewContainerRef.createComponent(factory, this.viewContainerRef.length, this.injector);
  }

  checkDateConfig(dateConfig: any) {
    if (!dateConfig) { return false; }
    if (typeof(dateConfig.timePicker) !== 'boolean' || !dateConfig.max || !dateConfig.min || !dateConfig.format) {
      return false;
    }
    return true;
  }

  ngOnInit() {
    this._minDate = this.minDate ? new Date(this.minDate) : new Date(this.dateConfig.min, 0, 1, 0, 0, 0);
    this._maxDate = this.maxDate ? new Date(this.maxDate) : new Date(this.dateConfig.max, 11, 31, 23, 59, 59);
    const target = this.cmpRef.location.nativeElement;
    this.applyPopupStyling(target);
    const component = this.cmpRef.instance;
    this.renderer2.setStyle(target, 'display', 'none');
    component.writeValue(this.selectedDate);
    this.fillPopupData();
    component.ngOnInit();

    component.registerOnChange(selectedDateObj => {
      this.writeValue(selectedDateObj);
      this.onChange(selectedDateObj.selectedDate);
    });

    component.selectedDateChange.subscribe((arg: SelectDateChangeEventArgs) => {
      if (arg.reason === SelectDateChangeReason.date && !this.showTime ||
       arg.reason === SelectDateChangeReason.button) {
        this.hide();
      }
    });

    if (this.autoOpen) {
      this.show();
    }
    this.setI18nText();
  }

  writeValue(obj: any): void {
    let curDate;
    if (obj && typeof obj === 'object' && obj.hasOwnProperty('selectedDate')) {
      curDate = obj.selectedDate;
    } else {
      curDate = obj;
    }
    this.selectedDate = curDate ?
      this.dateConverter.parse(curDate, this.dateFormat, this.locale || this.i18nLocale) : null;
    this.writeModelValue(obj);
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  private setI18nText() {
    this.i18nLocale = this.i18n.getI18nText().locale;
    this.i18nSubscription = this.i18n.langChange().subscribe((data) => {
      this.i18nLocale = data.locale;
    });
  }

  private parseDateFunc(date, direction) {
    const parseDate = this.dateConverter.parse(date, this.dateFormat, this.locale || this.i18nLocale)
      ;
    if (parseDate) {
      this[direction] = date
      ;
    }
  }

  private applyPopupStyling(nativeElement: any) {
    this.renderer2.addClass(nativeElement, 'devui-dropdown-menu');
    this.renderer2.addClass(nativeElement, 'devui-dropdown-overlay');
    this.renderer2.setStyle(nativeElement, 'padding', '0px');
    this.renderer2.setStyle(nativeElement, 'left', '-1px');
    if (this.direction === 'up') {
      this.renderer2.setStyle(nativeElement, 'top', 'auto');
      this.renderer2.setStyle(nativeElement, 'bottom', 'calc(100% - 1px)');
    }
  }

  hide() {
    const playAnimation = this.isOpen !== false;
    this.isOpen = false;
    if (playAnimation) {
      this.playAnimation();
    }
  }

  private writeModelValue(selectDateObj: any) {
    let selectDate;
    let dateReason = SelectDateChangeReason.time;
    if (selectDateObj && typeof selectDateObj === 'object' && selectDateObj.hasOwnProperty('selectedDate')) {
      selectDate = selectDateObj.selectedDate;
      dateReason = selectDateObj.reason;
    } else {
      selectDate = selectDateObj;
    }
    if (selectDate) {
      selectDate = new Date(selectDate);
    } else {
      selectDate = null;
    }
    const value = selectDate ? this.dateConverter.format(selectDate, this.dateFormat, this.locale || this.i18nLocale) : '';
    this.renderer2.setProperty(this.elementRef.nativeElement, 'value', value);
    if (this.isOpen) {
      this.cmpRef.instance.writeValue(this.selectedDate);
    }
    if (selectDateObj && typeof selectDateObj === 'object' && selectDateObj.hasOwnProperty('selectedDate')) {
      this.selectedDateChange.emit({
        reason: dateReason,
        selectedDate: this.selectedDate
      });
      this.onTouched();
    }
  }

  show() {
    const component = this.cmpRef.instance;
    component.writeValue(this.selectedDate);
    this.fillPopupData();
    const playAnimation = this.isOpen !== true;
    this.isOpen = true;
    const ele = this.formWithDropDown();
    let formPosition;
    if (this.direction === 'down') {
      formPosition = 'bottom';
    } else {
      formPosition = 'top';
    }
    if (ele && !ele.classList.contains('devui-dropdown-origin-open')) {
      ele.classList.add('devui-dropdown-origin-open');
    }
    if (ele && !ele.classList.contains(`devui-dropdown-origin-${formPosition}`)) {
      ele.classList.add(`devui-dropdown-origin-${formPosition}`);
    }
    if (playAnimation) {
      this.playAnimation();
    }
  }

  formWithDropDown() {
    if (this.elementRef) {
      if (!this.elementRef.nativeElement.classList.contains('devui-dropdown-origin')) {
        const parentEle = this.elementRef.nativeElement.parentElement;
        if (parentEle && parentEle.classList.contains('devui-dropdown-origin')) {
          return this.elementRef.nativeElement.parentElement;
        } else {
          return;
        }
      } else {
        return this.elementRef.nativeElement;
      }
    }
  }

  toggle($event: Event) {
    if ($event) {
      $event.stopPropagation();
    }
    if (this.isOpen) {
      this.hide();
      return;
    }
    this.show();
  }

  private fillPopupData() {
    ['showTime', 'maxDate', 'minDate', 'cssClass', 'disabled', 'dateConverter', 'locale', 'dateFormat', 'yearNumber', 'dateConfig',
    'customViewTemplate']
      .forEach(key => {
        if (this[key] !== undefined) {
          this.cmpRef.instance[key] = this[key];
        }
      });
  }

  @HostListener('blur', ['$event'])
  onBlur($event) {
    if (!this.cmpRef.instance.isClickingCmp) {
      this.transUserInputToDatepicker();
    }
  }

  @HostListener('document:click', ['$event'])
    onDocumentClick($event) {
    if (this.elementRef.nativeElement !== $event.target) {
      this.hide();
    }
  }

  clearAll(reason?: SelectDateChangeReason) {
    if (this.disabled) {
      return;
    }
    this.onTouched();
    this.cmpRef.instance.clearAll(reason);
  }

  private popIn(direction): AnimationMetadata[] {
    switch (direction) {
      case 'top':
        return [
          style({transform: 'perspective(1px) scale(0.9)', opacity: 0, transformOrigin: '0% 100%', display: 'inline-block'}),
          animate(`${animationDuration} ${easeOutQuint}`,
            style({transform: 'perspective(1px) scale(1)', opacity: 1, transformOrigin: '0% 100%'})),
        ];
      case 'bottom':
      default:
        return [
          style({transform: 'perspective(1px) scale(0.9)', opacity: 0, transformOrigin: '0% 0%', display: 'inline-block'}),
          animate(`${animationDuration} ${easeOutQuint}`,
            style({transform: 'perspective(1px) scale(1)', opacity: 1, transformOrigin: '0% 0%'})),
        ];
    }
  }

  private popOut(direction): AnimationMetadata[] {
    switch (direction) {
      case 'top':
        return [
          style({transform: 'perspective(1px) scale(1)', opacity: 1, transformOrigin: '0% 100%'}),
          animate(`${animationDuration} ${easeInQuint}`,
            style({transform: 'perspective(1px) scale(0.9)', opacity: 0, transformOrigin: '0% 100%'}))
        ];
      case 'bottom':
      default:
        return [
          style({transform: 'perspective(1px) scale(1)', opacity: 1, transformOrigin: '0% 0%'}),
          animate(`${animationDuration} ${easeInQuint}`,
            style({transform: 'perspective(1px) scale(0.9)', opacity: 0, transformOrigin: '0% 0%'}))
        ];
    }
  }

  private playAnimation() {
    if (this.player) {
      this.player.destroy();
    }
    let direction = '';
    switch (this.direction) {
      case 'down':
        direction = 'bottom';
        break;
      case 'up':
        direction = 'top';
        break;
      default:
        direction = 'bottom';
    }
    const metadata = this.isOpen ? this.popIn(direction) : this.popOut(direction);
    const factory = this.builder.build(metadata);
    this.renderer2.setStyle(this.cmpRef.location.nativeElement, 'display', 'inline-block');
    this.player = factory.create(this.cmpRef.location.nativeElement);
    this.player.onDone(() => {
      if (!this.isOpen) {
        const targetElement = this.cmpRef.location.nativeElement;
        this.renderer2.setStyle(targetElement, 'display', 'none');
        const ele = this.formWithDropDown();
        if (ele && ele.classList.contains('devui-dropdown-origin-open')) {
          ele.classList.remove('devui-dropdown-origin-open');
        }
        if (ele && ele.classList.contains('devui-dropdown-origin-top')) {
          ele.classList.remove('devui-dropdown-origin-top');
        }
        if (ele && ele.classList.contains('devui-dropdown-origin-bottom')) {
          ele.classList.remove('devui-dropdown-origin-bottom');
        }
      }
    });
    this.player.play();
  }

  private transUserInputToDatepicker() {
    const value = this.elementRef.nativeElement.value;
    if (!value && !this.selectedDate) {
      return;
    }
    if (!value) {
      this.clearAll();
      return;
    }
    const valueDate = new Date(value);
    const valueFormat = valueDate instanceof Date && !isNaN(valueDate.getTime()) &&
      this.dateConverter.format(valueDate, this.dateFormat, this.locale || this.i18nLocale);
    if (new Date(valueFormat).getTime() === new Date(this.selectedDate).getTime()) {
      return;
    }
    if (
      this.showTime || this.disabled || !valueDate || value !== valueFormat ||
      (value === valueFormat && (valueDate.getTime() < this.minDate.getTime() || valueDate.getTime() > this.maxDate.getTime()))
    ) {
      this.elementRef.nativeElement.value = this.selectedDate ?
        this.dateConverter.format(this.selectedDate, this.dateFormat, this.locale || this.i18nLocale) :
        '';
    } else {
      this.cmpRef.instance.chooseDate(value);
    }
  }

  ngOnDestroy() {
    if (this.i18nSubscription) {
      this.i18nSubscription.unsubscribe();
    }
  }
}
