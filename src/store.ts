import { isOperation } from './keys';
import { Entity, EntityMap, Link, LinkMap } from './types';

export interface StoreData {
  records: EntityMap;
  links: LinkMap;
}

class Store {
  private touched: string[];
  private records: EntityMap;
  private links: LinkMap;

  constructor(initial?: StoreData) {
    this.touched = [];
    this.records = Object.create(null);
    this.links = Object.create(null);
    if (initial !== undefined) {
      Object.assign(this.records, initial.records);
      Object.assign(this.links, initial.links);
    }
  }

  getEntity(key: string): null | Entity {
    if (!isOperation(key)) {
      this.touched.push(key);
    }

    const entity = this.records[key];
    return entity !== undefined ? entity : null;
  }

  getOrCreateEntity(key: string): Entity {
    const entity = this.getEntity(key);
    if (entity !== null) {
      return entity;
    }

    return (this.records[key] = Object.create(null));
  }

  writeEntityValue(key: string, prop: string, val: any) {
    if (!isOperation(key)) {
      this.touched.push(key);
    }

    const entity = this.getOrCreateEntity(key);
    if (val === null || val === undefined) {
      delete entity[prop];
    } else {
      entity[prop] = val;
    }
  }

  getLink(key: string): Link {
    this.touched.push(key);
    const link = this.links[key];
    return link !== undefined ? link : null;
  }

  writeLink(key: string, link: Link) {
    this.touched.push(key);

    if (link === null) {
      delete this.links[key];
    } else {
      this.links[key] = link;
    }
  }

  toJSON(): StoreData {
    return { records: this.records, links: this.links };
  }

  flushTouched(): string[] {
    const touched = this.touched.filter(
      (key, i, arr) => arr.indexOf(key) === i
    );
    this.touched = [];
    return touched;
  }
}

export default Store;