import { createMemoryRepository } from "./memory-repository";
import { describeRepositoryContract } from "./repository.contract";

describeRepositoryContract("memory", (id, seed) => createMemoryRepository(id, seed));
