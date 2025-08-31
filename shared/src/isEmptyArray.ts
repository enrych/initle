import isArray from "./isArray.js";

const isEmptyArray = <T>(value: unknown): value is T[] => {
  return isArray(value) && value.length === 0;
};

export default isEmptyArray;
