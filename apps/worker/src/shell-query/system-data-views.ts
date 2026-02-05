/**
 * System Data Views - Pure re-export from shared package
 *
 * All MCE system data view definitions are now maintained in @qpp/schema-inferrer.
 */

export {
  isSystemDataView,
  getSystemDataViewFields,
  getSystemDataViewNames,
  type SystemDataViewField as DataViewField,
} from "@qpp/schema-inferrer";
