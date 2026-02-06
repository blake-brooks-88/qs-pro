/**
 * System Data Views - Pure re-export from shared package
 *
 * All MCE system data view definitions are now maintained in @qpp/schema-inferrer.
 */

export {
  type SystemDataViewField as DataViewField,
  getSystemDataViewFields,
  getSystemDataViewNames,
  isSystemDataView,
} from "@qpp/schema-inferrer";
