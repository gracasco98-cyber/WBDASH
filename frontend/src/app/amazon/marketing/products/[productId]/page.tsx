import ProductWorkspace from "@/components/amazon/marketing/product-workspace/ProductWorkspace";

export default function AmazonMarketingProductPage({ params }: { params: { productId: string } }) {
  return <ProductWorkspace productId={params.productId}/>;
}
