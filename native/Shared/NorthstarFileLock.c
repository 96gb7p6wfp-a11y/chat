#include "NorthstarFileLock.h"
#include <sys/file.h>

int NorthstarFlock(int descriptor, int operation) {
    return flock(descriptor, operation);
}
