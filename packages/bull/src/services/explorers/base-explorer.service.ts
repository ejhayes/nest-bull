import { flatten } from '@nestjs/common';
import { Injectable, Type } from '@nestjs/common/interfaces';
import { ModulesContainer } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { Module } from '@nestjs/core/injector/module';
import { MetadataScanner } from '@nestjs/core/metadata-scanner';
import { BullCoreModule } from '../../bull-core.module';
import { BULL_QUEUE_DECORATOR } from '../../bull.constants';
import {
  BullModuleOptions,
  BullQueue,
  BullQueueOptions,
} from '../../bull.interfaces';
import { BullService } from '../bull.service';

export abstract class BaseExplorerService<Options> {
  constructor(
    protected readonly options: BullModuleOptions,
    protected readonly bullService: BullService,
    protected readonly modulesContainer: ModulesContainer,
    protected readonly metadataScanner: MetadataScanner,
  ) {}

  protected getAllModules(): Module[] {
    return [...this.modulesContainer.values()];
  }

  public explore(): void {
    const modules = this.getAllModules();

    this.getComponents(modules).forEach(component => {
      for (const wrapper of component.values()) {
        if (
          wrapper.isNotMetatype ||
          !this.hasBullQueueDecorator(wrapper.metatype)
        ) {
          continue;
        }

        const metadata = Reflect.getMetadata(
          BULL_QUEUE_DECORATOR,
          wrapper.metatype,
        ) as BullQueueOptions;
        const bullQueue = this.bullService.getQueue(metadata.name!);
        if (bullQueue) {
          this.onBullQueueProcess(bullQueue, wrapper);
        }
      }
    });
  }

  private getComponents(
    modules: Module[],
  ): Array<Map<string, InstanceWrapper<Injectable>>> {
    return flatten(
      modules
        .filter(module => module.metatype !== BullCoreModule)
        .map(module => module.components),
    ) as Array<Map<string, InstanceWrapper<Injectable>>>;
  }

  private hasBullQueueDecorator(metatype: Type<Injectable>): boolean {
    return Reflect.hasMetadata(BULL_QUEUE_DECORATOR, metatype);
  }
  protected onBullQueueProcess(
    bullQueue: BullQueue,
    wrapper: InstanceWrapper<Injectable>,
  ) {
    const { instance } = wrapper;
    const prototype = Object.getPrototypeOf(instance);
    const propertyNames = this.metadataScanner
      .scanFromPrototype(instance, prototype, propertyName => {
        if (this.verifyPropertyName(prototype, propertyName)) {
          return propertyName;
        }
      })
      .filter(x => x) as string[];

    propertyNames.forEach(propertyName =>
      this.onBullQueuePropertyProcess(
        bullQueue,
        instance,
        prototype,
        propertyName,
        propertyNames,
      ),
    );
  }

  protected abstract onBullQueuePropertyProcess(
    bullQueue: BullQueue,
    instance: Injectable,
    prototype: any,
    propertyName: string,
    allPropertyNames?: string[],
  ): void;

  protected abstract verifyPropertyName(
    target: any,
    propertyName: string,
  ): boolean;

  protected abstract getOptions(prototype: any, propertyName: string): Options;
}
