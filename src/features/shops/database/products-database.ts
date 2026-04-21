/* Developer: BANGDET.MD */
import { DatabaseError } from "@/database/database-types.js"
import { update } from "@/database/helpers.js"
import { Product, ProductOptions, ProductOptionsOptional } from "@/features/shops/database/products-types.js"
import { getShops, shopsDatabase } from "@/features/shops/database/shops-database.js"
import { err, ok } from "@/lib/error-handling.js"
import { nanoid } from "nanoid"

export function getProducts(shopId: string){
    if (!getShops().has(shopId)) {
        return err(new DatabaseError("ShopDoesNotExist"))
    }

    return ok(getShops().get(shopId)!.products)
}

export async function addProduct(shopId: string, options: ProductOptions) {
    if (!getShops().has(shopId)) return err(new DatabaseError("ShopDoesNotExist"))

    // Duplicate name check: reject if a product with the same name already exists in this shop
    const existingProducts = getShops().get(shopId)!.products
    const nameTaken = [...existingProducts.values()].some(
        p => p.name.trim().toLowerCase() === options.name.trim().toLowerCase()
    )
    if (nameTaken) return err(new DatabaseError("ProductAlreadyExists"))

    const id = nanoid()
    const product = Object.assign({ id, shopId }, options)

    getShops().get(shopId)!.products.set(id, product)
    await shopsDatabase.save()

    return ok(getShops().get(shopId)!.products.get(id)!)
}

export async function removeProduct(shopId: string, productId: string) {
    if (!getShops().has(shopId))return err(new DatabaseError("ShopDoesNotExist"))

    getShops().get(shopId)!.products.delete(productId)
    await shopsDatabase.save()
    return ok(true)
}


const PRODUCT_FIELD_HANDLERS = {
    amount: (product: Product, amount: number) => {
        if (amount == -1) product.amount = undefined
        else product.amount = amount
    }
}


export async function updateProduct(
    shopId: string,
    productId: string,
    options: ProductOptionsOptional,
) {
    if (!getShops().has(shopId)) return err(new DatabaseError("ShopDoesNotExist"))

    const product = getShops().get(shopId)!.products.get(productId)

    if (!product) return err(new DatabaseError("ProductDoesNotExist"))

    // Duplicate name check when renaming: reject if another product already has the new name
    if (options.name !== undefined) {
        const nameTaken = [...getShops().get(shopId)!.products.values()].some(
            p => p.id !== productId && p.name.trim().toLowerCase() === options.name!.trim().toLowerCase()
        )
        if (nameTaken) return err(new DatabaseError("ProductAlreadyExists"))
    }

    update(product, options, PRODUCT_FIELD_HANDLERS)

    await shopsDatabase.save()
    return ok(product)
}

export function getProductName( shopId: string | undefined, productId: string | undefined) {
    if (!shopId || !productId) return undefined

    const product = getShops().get(shopId)?.products.get(productId)
    if (!product) return undefined

    return `${product.emoji != "" ? `${product.emoji} ` : ""}${product.name}`
}
